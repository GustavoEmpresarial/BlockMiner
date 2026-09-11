/**
 * On-chain deposit flow. Ported from legacy wallet/application/wallet.service.ts
 * (estimateDepositGas, submitDepositForVerification).
 *
 * Deviation (documented, gas estimation only): `estimateDepositGas` still always returns
 * legacy's own fallback path (a conservative flat gas limit) instead of hitting a live provider
 * — that's a client-side UX hint, not a security-relevant path.
 *
 * The confirmation side of this deviation is CLOSED: submitted deposits go to
 * `pending_verification` and are now actually verified against the real Polygon chain by
 * `deposit-verifier.service.ts` (`runDepositVerifier`, polled by
 * `server/cron/deposit-verifier.cron.ts`). `creditCompletedDeposit` below remains for direct
 * unit-testing of the balance invariant; the verifier calls the richer
 * `deposit.repository.ts#creditVerifiedDeposit` (adds source/valuation/tournament fields) once a
 * deposit clears `DEPOSIT_MIN_CONFIRMATIONS` block confirmations.
 */
import { prismaErrorCode } from "../../../shared/errors/prismaHttpErrors.js";
import * as depositRepo from "./deposit.repository.js";
import type { DepositGasEstimateInput, SubmitDepositOutcome } from "./deposit.types.js";

const MIN_DEPOSIT_POL = Number(process.env.MIN_DEPOSIT_POL || 1);

export function getMinDepositPol(): number {
  return MIN_DEPOSIT_POL;
}

/** Deferred to a live Polygon provider (see module doc-comment) — always the safe fallback. */
export async function estimateDepositGas(_input: DepositGasEstimateInput): Promise<{ gasLimit: string; fallback: boolean }> {
  return { gasLimit: "0x5208", fallback: true };
}

export async function submitDepositForVerification(
  userId: number,
  txHashRaw: unknown,
  claimedAmountRaw: unknown,
): Promise<SubmitDepositOutcome> {
  if (!txHashRaw || typeof txHashRaw !== "string") return { kind: "missing_hash" };
  const normalizedHash = txHashRaw.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalizedHash)) return { kind: "invalid_hash_format" };

  let parsedClaimed = 0;
  if (claimedAmountRaw !== undefined && claimedAmountRaw !== "") {
    parsedClaimed = parseFloat(String(claimedAmountRaw));
    if (isNaN(parsedClaimed) || parsedClaimed < 0) return { kind: "invalid_amount" };
  }

  const existing = await depositRepo.findDepositByHashForUser(normalizedHash, userId);
  if (existing) {
    if (existing.status === "completed") return { kind: "already_completed" };
    if (existing.status === "pending_verification") return { kind: "already_pending", depositId: existing.id };
  }

  const otherClaim = await depositRepo.findDepositClaimByHash(normalizedHash, userId);
  if (otherClaim) return { kind: "hash_claimed", reason: "anti_fraud" };

  try {
    const deposit = await depositRepo.createPendingVerificationDeposit(
      userId,
      parsedClaimed > 0 ? parsedClaimed.toString() : "0",
      normalizedHash,
    );
    return { kind: "created", depositId: deposit.id, txHash: normalizedHash };
  } catch (err: unknown) {
    if (prismaErrorCode(err) === "P2002") {
      const winner = await depositRepo.findAnyDepositByHash(normalizedHash);
      if (winner?.userId === userId) {
        return { kind: "already_pending", depositId: winner.id };
      }
      return { kind: "hash_claimed", reason: "race_conflict" };
    }
    throw err;
  }
}
