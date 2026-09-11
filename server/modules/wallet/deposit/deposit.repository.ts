import prisma from "../../../core/database/prisma.js";
import { publishDepositConfirmedOutbox, type DepositConfirmedPayload } from "../../tournaments/index.js";

export async function listDepositsForUser(userId: number) {
  return prisma.transaction.findMany({
    where: { userId, type: "deposit" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function findDepositByHashForUser(txHash: string, userId: number) {
  return prisma.transaction.findFirst({ where: { txHash, userId, type: "deposit" } });
}

export async function findDepositClaimByHash(txHash: string, excludeUserId: number) {
  return prisma.transaction.findFirst({
    where: {
      txHash,
      type: "deposit",
      status: { in: ["completed", "pending_verification"] },
      userId: { not: excludeUserId },
    },
  });
}

export async function findAnyDepositByHash(txHash: string) {
  return prisma.transaction.findFirst({ where: { txHash, type: "deposit" } });
}

export async function createPendingVerificationDeposit(userId: number, amount: string, txHash: string) {
  return prisma.transaction.create({
    data: { userId, type: "deposit", amount, txHash, status: "pending_verification", verifyAttempts: 0 },
  });
}

export async function listRecentDepositsForStatusPoll(userId: number) {
  return prisma.transaction.findMany({
    where: { userId, type: "deposit", status: { in: ["pending_verification", "completed", "failed"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

/**
 * Credits a completed on-chain deposit. Faithful to the legacy financial invariant:
 * balance mutation + transaction status update happen inside a single `$transaction`.
 * (Legacy pitfall #7 — settlement is synchronous here; the actual RPC confirmation
 * polling that decides *when* to call this is deferred, see deposit.service.ts.)
 */
export async function creditCompletedDeposit(transactionId: number, userId: number, amountPol: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!row || row.status === "completed") return row;
    await tx.user.update({ where: { id: userId }, data: { polBalance: { increment: amountPol } } });
    return tx.transaction.update({
      where: { id: transactionId },
      data: { status: "completed", completedAt: new Date() },
    });
  });
}

// --- Deposit verifier support (server/modules/wallet/deposit/deposit-verifier.service.ts) ---

export async function listPendingVerificationDeposits(limit = 50) {
  return prisma.transaction.findMany({
    where: { type: "deposit", status: "pending_verification" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

export async function findLinkedWalletAddress(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
  return user?.walletAddress ?? null;
}

/** Custodial Polygon HD deposit address allocated for this user (one row per user). */
export async function findHdDepositAddressForUser(userId: number): Promise<string | null> {
  const row = await prisma.polygonHdAddress.findUnique({
    where: { userId },
    select: { address: true },
  });
  return row?.address ?? null;
}

export async function findCompletedDuplicateByHash(txHash: string, excludeTransactionId: number) {
  return prisma.transaction.findFirst({
    where: { txHash, status: "completed", type: "deposit", id: { not: excludeTransactionId } },
  });
}

/** Bumps `verifyAttempts` only — used when the tx isn't mined yet or a transient error occurred. */
export async function bumpDepositVerifyAttempts(transactionId: number, attempts: number) {
  return prisma.transaction.update({ where: { id: transactionId }, data: { verifyAttempts: attempts } });
}

/** Marks a pending deposit as permanently failed (never crediting anything). */
export async function markDepositVerificationFailed(
  transactionId: number,
  attempts: number,
  errorInfo: Record<string, unknown>,
) {
  return prisma.transaction.update({
    where: { id: transactionId },
    data: { status: "failed", verifyAttempts: attempts, rawTx: JSON.stringify(errorInfo) },
  });
}

export type CreditVerifiedDepositInput = {
  transactionId: number;
  userId: number;
  verifiedAmountPol: number;
  fromAddress: string | null;
  attempts: number;
  blockNumber: number;
  source: string;
  confirmedEventAt: Date;
  usdRate: number;
  usdValue: number;
  countsForTournament: boolean;
  priceSnapshotId: number;
};

/**
 * Credits the REAL on-chain value (never the user-declared amount) atomically with the
 * transaction status update and the tournament outbox event — mirrors legacy
 * depositVerifier.ts's single `prisma.$transaction` block.
 *
 * Idempotent / anti-double-credit:
 * - Only transitions `pending_verification` → `completed` (lost races no-op).
 * - If another deposit row already completed the same `txHash`, marks this row `failed`
 *   and does **not** increment balance.
 */
export async function creditVerifiedDeposit(input: CreditVerifiedDepositInput) {
  const amountStr = input.verifiedAmountPol.toString();
  return prisma.$transaction(async (tx) => {
    const row = await tx.transaction.findUnique({ where: { id: input.transactionId } });
    if (!row || row.type !== "deposit") return null;
    if (row.status === "completed") return row;
    if (row.status !== "pending_verification") return null;

    const hash = typeof row.txHash === "string" ? row.txHash.trim().toLowerCase() : "";
    if (hash) {
      const duplicate = await tx.transaction.findFirst({
        where: {
          txHash: hash,
          type: "deposit",
          status: "completed",
          id: { not: input.transactionId },
        },
        select: { id: true },
      });
      if (duplicate) {
        await tx.transaction.update({
          where: { id: input.transactionId },
          data: {
            status: "failed",
            verifyAttempts: input.attempts,
            rawTx: JSON.stringify({
              error: "duplicate_txhash",
              existingId: duplicate.id,
              blockedAt: new Date().toISOString(),
            }),
          },
        });
        return null;
      }
    }

    const rawTx = JSON.stringify({
      verifiedAmount: input.verifiedAmountPol,
      block: input.blockNumber,
      from: input.fromAddress,
      source: input.source,
      usdRate: input.usdRate,
      usdValue: input.usdValue,
      confirmedEventAt: input.confirmedEventAt.toISOString(),
    });

    const claimed = await tx.transaction.updateMany({
      where: { id: input.transactionId, status: "pending_verification", type: "deposit" },
      data: {
        status: "completed",
        amount: amountStr,
        fromAddress: input.fromAddress ? input.fromAddress.toLowerCase() : null,
        completedAt: new Date(),
        verifyAttempts: input.attempts,
        confirmedEventAt: input.confirmedEventAt,
        usdRateAtConfirmation: input.usdRate.toString(),
        usdValueAtConfirmation: input.usdValue.toString(),
        countsForTournament: input.countsForTournament,
        priceSnapshotId: input.priceSnapshotId,
        rawTx,
      },
    });
    if (claimed.count !== 1) return null;

    await tx.user.update({ where: { id: input.userId }, data: { polBalance: { increment: amountStr } } });

    const updated = await tx.transaction.findUnique({ where: { id: input.transactionId } });
    if (!updated) return null;

    const payload: DepositConfirmedPayload = {
      transactionId: input.transactionId,
      userId: input.userId,
      polAmount: input.verifiedAmountPol,
      usdValue: input.usdValue,
      usdRate: input.usdRate,
      eventAt: input.confirmedEventAt.toISOString(),
      source: input.source,
      countsForTournament: input.countsForTournament,
      txHash: updated.txHash ?? null,
    };
    await publishDepositConfirmedOutbox(payload, tx);

    return updated;
  });
}
