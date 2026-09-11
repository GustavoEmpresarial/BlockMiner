/**
 * Ported from legacy/server/modules/checkin/checkin.controller.ts. HTTP-only —
 * business logic lives in checkin.service.ts.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { allowsOffchainCheckin, allowsWalletCheckin } from "./checkin.config.js";
import { assertValidTxHash, parseOptionalChainIdFromBody } from "./checkin.chain.js";
import { CheckinHttpError, mapCheckinError } from "./checkin.errors.js";
import * as checkinService from "./checkin.service.js";
import { computeRecoveryStatus, payStreakRecoveryForUser, RecoveryInsufficientBalanceError, RecoveryNotEligibleError } from "./checkin.recovery.js";
import { parseTaxPayCurrency } from "../../shared/taxPaymentCurrency.js";

const log = logger.child("checkin.controller");

function jsonCheckinError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, code, message });
}

function parseCadenceFromBody(body: unknown): "daily" | null {
  const b = body as Record<string, unknown> | null | undefined;
  const raw = typeof b?.cadence === "string" ? b.cadence.trim().toLowerCase() : "daily";
  return raw === "daily" ? "daily" : null;
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const status = await checkinService.getStatusForUser(user.id);
    res.json({ ok: true, ...status });
  } catch (e: unknown) {
    log.error("Checkin getStatus:", { error: String(e) });
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Não foi possível carregar o status do check-in agora." });
  }
}

export async function getCheckinRewards(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const rewards = await checkinService.getRewardsForUser(user.id);
    res.json({ ok: true, ...rewards });
  } catch (e: unknown) {
    log.error("getCheckinRewards", { error: String(e) });
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to load rewards." });
  }
}

export async function getCheckinHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const history = await checkinService.getHistoryForUser(user.id);
    res.json({ ok: true, history });
  } catch (e: unknown) {
    log.error("getCheckinHistory", { error: String(e) });
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to load history." });
  }
}

export async function checkinBalance(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const cadence = parseCadenceFromBody(req.body);
  if (cadence !== "daily") {
    jsonCheckinError(res, 400, "INVALID_CADENCE", 'Only daily check-in is available. Send cadence: "daily".');
    return;
  }
  try {
    const payload = await checkinService.checkinBalanceForUser(user.id);
    res.json({ ok: true, ...payload });
  } catch (err: unknown) {
    const mapped = mapCheckinError(err);
    if (mapped) {
      jsonCheckinError(res, mapped.status, mapped.code, mapped.message);
      return;
    }
    log.error("checkinBalance:", { error: String(err) });
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to complete check-in." });
  }
}

export async function claimCheckin(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    if (!allowsOffchainCheckin()) {
      jsonCheckinError(res, 400, "ONCHAIN_ONLY", "Check-in is on-chain only. Use wallet payment with a valid transaction hash.");
      return;
    }
    return checkinBalance(req, res);
  } catch (e: unknown) {
    log.error("claimCheckin", { error: String(e) });
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to complete check-in." });
  }
}

function parseTxHashFromBody(body: unknown): { txHash: string } | { error: { code: string; message: string } } {
  const b = body as Record<string, unknown> | null | undefined;
  const txHashRaw = typeof b?.txHash === "string" ? b.txHash.trim() : "";
  if (!txHashRaw) return { error: { code: "INVALID_BODY", message: "Transaction hash is required." } };
  try {
    return { txHash: assertValidTxHash(txHashRaw) };
  } catch {
    return { error: { code: "INVALID_TX_HASH", message: "Invalid transaction hash format." } };
  }
}

export async function confirmCheckin(req: Request, res: Response): Promise<void> {
  try {
    const cadence = parseCadenceFromBody(req.body);
    if (cadence !== "daily") {
      jsonCheckinError(res, 400, "INVALID_CADENCE", 'Only daily check-in is available. Send cadence: "daily" with your transaction hash.');
      return;
    }
    if (!allowsWalletCheckin()) {
      jsonCheckinError(res, 400, "OFFCHAIN_ONLY", "Wallet check-in is disabled. Use in-game balance check-in instead.");
      return;
    }
    const user = requireSessionUser(req, res);
    if (!user) return;

    const parsedTx = parseTxHashFromBody(req.body);
    if ("error" in parsedTx) {
      jsonCheckinError(res, 400, parsedTx.error.code, parsedTx.error.message);
      return;
    }

    const bodyWalletRaw =
      typeof (req.body as Record<string, unknown> | undefined)?.walletAddress === "string"
        ? String((req.body as Record<string, unknown>).walletAddress).trim()
        : "";

    const outcome = await checkinService.confirmWalletCheckinForUser({
      userId: user.id,
      txHash: parsedTx.txHash,
      chainIdFromBody: parseOptionalChainIdFromBody(req.body),
      walletFromBody: bodyWalletRaw || null,
    });

    if (outcome.kind === "already") {
      const payload = await checkinService.successWithStreak(user.id, { alreadyCheckedIn: true, status: "confirmed", cadence: "daily" });
      res.json({ ok: true, ...payload });
      return;
    }
    if (outcome.kind === "pending") {
      res.json({ ok: false, pending: true, cadence: "daily", code: "TRANSACTION_NOT_CONFIRMED", message: "Transaction was sent but is still waiting for confirmation." });
      return;
    }
    if (outcome.kind === "failed") {
      jsonCheckinError(res, 400, "INVALID_CHECKIN_TRANSACTION", outcome.reason);
      return;
    }

    const payload = await checkinService.successWithStreak(user.id, { status: "confirmed", cadence: "daily" });
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    const mapped = mapCheckinError(error);
    if (mapped) {
      jsonCheckinError(res, mapped.status, mapped.code, mapped.message);
      return;
    }
    if (error instanceof CheckinHttpError) {
      jsonCheckinError(res, 400, error.code, error.message);
      return;
    }
    log.error("Checkin confirm error:", { error: String(error) });
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to confirm check-in." });
  }
}

/** POST /api/checkin/claim/onchain — alias for wallet tx confirmation. */
export async function claimCheckinOnchain(req: Request, res: Response): Promise<void> {
  return confirmCheckin(req, res);
}

/** Wallet-based check-in: same verification path as POST /checkin/confirm. */
export async function checkinWallet(req: Request, res: Response): Promise<void> {
  return confirmCheckin(req, res);
}

export async function getStreakRecoveryStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const status = await computeRecoveryStatus(user.id);
    res.json(status);
  } catch (err: unknown) {
    log.error("getStreakRecoveryStatus", { error: String(err) });
    res.status(500).json({ error: "internal_error" });
  }
}

export async function payStreakRecovery(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    try {
      const currency = parseTaxPayCurrency(req.body?.currency);
      const result = await payStreakRecoveryForUser(user.id, currency);
      res.json({
        success: true,
        feePaid: result.feePaid,
        feePol: result.feePol,
        currency: result.currency,
        missedDays: result.missedDays,
        restoredStreak: result.restoredStreak,
      });
    } catch (err: unknown) {
      if (err instanceof RecoveryNotEligibleError) {
        res.status(400).json({ error: "not_eligible", reason: err.reason });
        return;
      }
      if (err instanceof RecoveryInsufficientBalanceError) {
        res.status(400).json({
          error: "insufficient_balance",
          currency: err.currency,
          required: err.required,
          available: err.available,
        });
        return;
      }
      throw err;
    }
  } catch (err: unknown) {
    log.error("payStreakRecovery", { userId: user.id, error: String(err) });
    res.status(500).json({ error: "internal_error" });
  }
}
