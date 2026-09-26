/**
 * User-facing withdrawal request + admin approve/reject/complete flow, fused
 * from legacy wallet.controller.ts (requestWithdrawal) and
 * legacy finance/withdrawalAdmin.controller.ts.
 *
 * Deviation (documented): email-2FA-gated withdrawal challenge is still deferred
 * — same SMTP stub pattern as Fase 1. Auto-send (hot wallet / CoinEx) itself WAS
 * ported (2026-08-08, PROGRESSO.txt 11b) — see withdrawal.auto-send.ts, which
 * runs off the `approved` queue via its own cron (withdrawal-auto-send.cron.ts),
 * dry-run only in this environment (no WITHDRAWAL_PRIVATE_KEY configured here).
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import { WITHDRAW_PROCESSING_HOURS } from "../wallet.types.js";
import * as withdrawalRepo from "./withdrawal.repository.js";
import * as withdrawalService from "./withdrawal.service.js";
import { getHotWalletPaymentStatus } from "./withdrawal.auto-send.js";
import { notifyWithdrawalCompleted } from "../../notifications/telegram.service.js";
import { logAdminAction } from "../../admin/index.js";
import { logger } from "../../../core/logger/index.js";

const log = logger.child("WithdrawalController");

export async function getWithdrawFeeInfo(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const info = await withdrawalService.getWithdrawalFeeInfo(user.id);
    res.json({ ok: true, ...info });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to fetch fee info." });
  }
}

export async function requestWithdrawal(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { amount, address } = req.body as { amount: number; address: string };
    const transaction = await withdrawalService.submitWithdrawalRequest(user.id, amount, address);
    res.json({
      ok: true,
      message: `Withdrawal request submitted. Processing time: up to ${WITHDRAW_PROCESSING_HOURS} business hours.`,
      transaction: withdrawalService.toWithdrawalPublicDto(transaction),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unable to request withdrawal.";
    if (msg === "Pending withdrawal exists") {
      res.status(409).json({ ok: false, message: msg });
      return;
    }
    if (msg === "Insufficient balance") {
      res.status(400).json({ ok: false, message: msg });
      return;
    }
    res.status(400).json({ ok: false, message: msg });
  }
}

export async function getShibWithdrawMin(_req: Request, res: Response): Promise<void> {
  try {
    const info = await withdrawalService.getShibWithdrawMinInfo();
    res.json({ ok: true, ...info });
  } catch {
    res.status(503).json({ ok: false, message: "Unable to fetch SHIB price" });
  }
}

export async function requestShibWithdrawal(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { amount, address } = req.body as { amount?: unknown; address?: unknown };
    const outcome = await withdrawalService.submitShibWithdrawal(user.id, amount, address);

    if (!outcome.ok) {
      if (outcome.reason === "disabled") {
        res.status(503).json({ ok: false, message: "SHIB withdrawals are temporarily disabled." });
        return;
      }
      if (outcome.reason === "below_minimum") {
        const minFmt = (outcome.minShib ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
        res.status(400).json({
          ok: false,
          message: `Minimum withdrawal is $${outcome.minUsd} USD (≈ ${minFmt} SHIB at current price)`,
        });
        return;
      }
      if (outcome.reason === "invalid_address") {
        res.status(400).json({ ok: false, message: "Invalid ERC20 address" });
        return;
      }
      res.status(400).json({ ok: false, message: "Invalid amount" });
      return;
    }

    res.json({
      ok: true,
      message: `SHIB withdrawal of ${outcome.netAmount} SHIB submitted. Fee: ${outcome.fee} SHIB. Network: ERC20. Processing time: up to ${outcome.processingHours} business hours.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unable to request SHIB withdrawal.";
    if (msg === "Pending withdrawal exists") {
      res.status(409).json({ ok: false, message: msg });
      return;
    }
    if (msg === "Insufficient balance" || /Insufficient SHIB/i.test(msg)) {
      res.status(400).json({ ok: false, message: msg });
      return;
    }
    res.status(400).json({ ok: false, message: msg });
  }
}

// --- Admin (fused from finance/withdrawalAdmin.controller.ts) ---

export async function adminListPendingWithdrawals(_req: Request, res: Response): Promise<void> {
  try {
    const withdrawals = await withdrawalRepo.getWithdrawalsForAdmin();
    res.json({ ok: true, withdrawals: withdrawals.map((w) => ({ ...w, amount: Number(w.amount) })) });
  } catch (err: unknown) {
    log.error("adminListPendingWithdrawals failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Load failed" });
  }
}

function parsePositiveIntId(val: unknown): number | null {
  const n = Number(val);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) return null;
  return n;
}

export async function adminApproveWithdrawal(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.withdrawalId);
    if (!id) {
      res.status(400).json({ ok: false, message: "Invalid withdrawal id" });
      return;
    }
    const row = await withdrawalRepo.findWithdrawalById(id);
    if (!row || (row.type !== "withdrawal" && row.type !== "shib_withdrawal")) {
      res.status(404).json({ ok: false, message: "Withdrawal not found" });
      return;
    }
    if (row.status !== "pending") {
      res.status(400).json({ ok: false, message: "Only pending withdrawals can be approved" });
      return;
    }
    // Atomic guard — see withdrawal.repository.ts header comment. `false` means someone
    // else (another admin, or the auto-send tick) already moved this row off "pending"
    // between our read above and this write.
    const applied = await withdrawalRepo.markWithdrawalApproved(id);
    if (!applied) {
      res.status(409).json({ ok: false, message: "Withdrawal was already processed by another action" });
      return;
    }

    const adminUser = (req as unknown as { admin?: { id?: number; adminId?: number; email?: string } }).admin;
    const adminId = adminUser?.adminId ?? adminUser?.id ?? null;
    void logAdminAction({
      adminId,
      adminEmail: adminUser?.email,
      action: "admin_withdrawal_approved",
      module: "wallet",
      resource: "withdrawal",
      resourceId: String(id),
      oldValue: { status: row.status, amount: String(row.amount), address: row.address, type: row.type },
      newValue: { status: "approved" },
      ipAddress: req.ip,
      userAgent: typeof req.get === "function" ? req.get("user-agent") || null : null,
      success: true,
    }).catch((auditErr: unknown) => {
      log.warn("admin_audit_log failed for withdrawal approve", { error: String(auditErr) });
    });

    res.json({ ok: true, message: "Withdrawal approved" });
  } catch (err: unknown) {
    log.error("adminApproveWithdrawal failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Approval failed" });
  }
}

export async function adminRejectWithdrawal(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.withdrawalId);
    if (!id) {
      res.status(400).json({ ok: false, message: "Invalid withdrawal id" });
      return;
    }
    const row = await withdrawalRepo.findWithdrawalById(id);
    if (!row || (row.type !== "withdrawal" && row.type !== "shib_withdrawal")) {
      res.status(404).json({ ok: false, message: "Withdrawal not found" });
      return;
    }
    if (!["pending", "approved"].includes(row.status)) {
      res.status(400).json({ ok: false, message: "Cannot reject this withdrawal" });
      return;
    }
    const applied = await withdrawalRepo.markWithdrawalRejected(id);
    if (!applied) {
      res.status(409).json({ ok: false, message: "Withdrawal was already processed by another action" });
      return;
    }

    const adminUser = (req as unknown as { admin?: { id?: number; adminId?: number; email?: string } }).admin;
    const adminId = adminUser?.adminId ?? adminUser?.id ?? null;
    void logAdminAction({
      adminId,
      adminEmail: adminUser?.email,
      action: "admin_withdrawal_rejected",
      module: "wallet",
      resource: "withdrawal",
      resourceId: String(id),
      oldValue: { status: row.status, amount: String(row.amount), address: row.address, type: row.type },
      newValue: { status: "rejected", refundIssued: true },
      ipAddress: req.ip,
      userAgent: typeof req.get === "function" ? req.get("user-agent") || null : null,
      success: true,
    }).catch((auditErr: unknown) => {
      log.warn("admin_audit_log failed for withdrawal reject", { error: String(auditErr) });
    });

    res.json({ ok: true, message: "Withdrawal rejected" });
  } catch (err: unknown) {
    log.error("adminRejectWithdrawal failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Rejection failed" });
  }
}

export async function adminCompleteWithdrawal(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.withdrawalId);
    if (!id) {
      res.status(400).json({ ok: false, message: "Invalid withdrawal id" });
      return;
    }
    const rawHash = (req.body as { txHash?: unknown })?.txHash;
    if (!withdrawalService.isValidPolygonTxHash(rawHash)) {
      res.status(400).json({ ok: false, message: "txHash required (0x + 64 hex characters)" });
      return;
    }
    const row = await withdrawalRepo.findWithdrawalById(id);
    if (!row || (row.type !== "withdrawal" && row.type !== "shib_withdrawal")) {
      res.status(404).json({ ok: false, message: "Withdrawal not found" });
      return;
    }
    if (row.status === "completed") {
      res.status(400).json({ ok: false, message: "Withdrawal already completed" });
      return;
    }
    if (!["pending", "approved"].includes(row.status)) {
      res.status(400).json({ ok: false, message: "Cannot complete this withdrawal" });
      return;
    }
    const txHash = String(rawHash).trim();
    const completed = await withdrawalRepo.markWithdrawalCompleted(id, txHash);
    if (!completed) {
      res.status(409).json({ ok: false, message: "Withdrawal was already processed by another action" });
      return;
    }
    // Public Telegram proof — same real gap fixed in withdrawal.auto-send.ts (PROGRESSO.txt
    // item 73): a manually-completed withdrawal must post the public proof too, not just the
    // auto-send path.
    notifyWithdrawalCompleted({
      id: completed.id,
      userId: completed.userId,
      amount: completed.amount,
      address: completed.address,
      txHash: completed.txHash,
      status: completed.status,
      createdAt: completed.createdAt,
    }).catch((err: unknown) => log.warn(`notifyWithdrawalCompleted failed for tx ${id}`, { error: String(err) }));

    const adminUser = (req as unknown as { admin?: { id?: number; adminId?: number; email?: string } }).admin;
    const adminId = adminUser?.adminId ?? adminUser?.id ?? null;
    void logAdminAction({
      adminId,
      adminEmail: adminUser?.email,
      action: "admin_withdrawal_completed",
      module: "wallet",
      resource: "withdrawal",
      resourceId: String(id),
      oldValue: { status: row.status, amount: String(row.amount), address: row.address, type: row.type },
      newValue: { status: "completed", txHash },
      ipAddress: req.ip,
      userAgent: typeof req.get === "function" ? req.get("user-agent") || null : null,
      success: true,
    }).catch((auditErr: unknown) => {
      log.warn("admin_audit_log failed for withdrawal complete", { error: String(auditErr) });
    });

    res.json({ ok: true, message: "Withdrawal marked as completed" });
  } catch (err: unknown) {
    log.error("adminCompleteWithdrawal failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Marking as completed failed" });
  }
}

/** Live balance + coverage of the POL payment (hot) wallet used by auto-send. */
export async function adminGetHotWalletStatus(_req: Request, res: Response): Promise<void> {
  try {
    const status = await getHotWalletPaymentStatus();
    res.json({ ok: true, hotWallet: status });
  } catch (err: unknown) {
    log.error("adminGetHotWalletStatus failed", { error: String(err) });
    res.status(500).json({ ok: false, message: "Unable to load hot wallet status" });
  }
}
