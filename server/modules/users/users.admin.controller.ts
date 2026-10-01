/**
 * Admin user-management controller.
 * Strongly-typed handlers for user listing, detail metrics, balance adjustment, bans,
 * password reset, security unlocking and miner grants.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { hashPassword } from "../../shared/security/password.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as usersAdminRepo from "./usersAdmin.repository.js";
import { logAdminAction } from "../admin/index.js";
import { grantPurchasedInventoryItems } from "../inventory/index.js";
import {
  adminAdjustBalanceSchema,
  adminBanUserSchema,
  adminResetPasswordSchema,
  adminSendMinerSchema,
  adminUserIdParamSchema,
  adminUsersListQuerySchema,
  type AdminBalanceCurrency,
} from "./users.admin.schemas.js";

const log = logger.child("UsersAdmin");

function adminErrMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function adminActorId(req: Request): number | null {
  const adm = (req as Request & { admin?: { adminId?: number } }).admin;
  const id = adm?.adminId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function readUserAgent(req: Request): string {
  const raw = req.headers["user-agent"];
  return Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
}

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminUsersListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
      return;
    }

    const { page, pageSize, query, status, fromDate, toDate } = parsed.data;
    const data = await usersAdminRepo.listUsers({
      page,
      pageSize,
      query,
      status,
      fromDate,
      toDate,
    });
    res.json({ ok: true, ...data });
  } catch (error: unknown) {
    log.error("[admin users list]", { error: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to load users." });
  }
}

export async function getUserDetailHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const user = await usersAdminRepo.getUserDetail(userId);
    if (!user) {
      res.status(404).json({ ok: false, code: "not_found", message: "User not found" });
      return;
    }

    const metrics = await usersAdminRepo.getUserProfileMetrics(userId, user.ip);
    res.json({ ok: true, user, metrics });
  } catch (error: unknown) {
    log.error("[admin user detail]", { error: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to load user detail." });
  }
}

async function requireExistingUser(userId: number, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (user) return true;
  res.status(404).json({ ok: false, code: "not_found", message: "User not found" });
  return false;
}

export async function getUserTicketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    if (!(await requireExistingUser(userId, res))) return;
    const tickets = await usersAdminRepo.listUserSupportTickets(userId);
    res.json({ ok: true, userId, tickets });
  } catch (error: unknown) {
    log.error("[admin user tickets]", { error: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to load user tickets." });
  }
}

export async function getRelatedUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    if (!(await requireExistingUser(userId, res))) return;
    const related = await usersAdminRepo.listRelatedUsers(userId);
    res.json({ ok: true, userId, related });
  } catch (error: unknown) {
    log.error("[admin user related]", { error: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to load related accounts." });
  }
}

export async function sendMinerHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const bodyParsed = adminSendMinerSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }
    const { minerId, quantity } = bodyParsed.data;

    const [user, miner] = await Promise.all([
      usersAdminRepo.findUserForBan(userId),
      usersAdminRepo.findGrantableMiner(minerId),
    ]);
    if (!user) {
      res.status(404).json({ ok: false, code: "not_found", message: "User not found" });
      return;
    }
    if (!miner) {
      res.status(404).json({ ok: false, code: "not_found", message: "Active miner not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await grantPurchasedInventoryItems(
        tx,
        userId,
        {
          minerId: miner.id,
          minerName: miner.name,
          hashRate: miner.baseHashRate,
          slotSize: miner.slotSize,
          imageUrl: miner.imageUrl,
          snapshotSlug: miner.slug,
          snapshotPrice: Number(miner.price),
          acquisitionSource: "admin_grant",
        },
        quantity,
        new Date()
      );
    });

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_GRANT_MINER",
      module: "users",
      resource: "User",
      resourceId: String(userId),
      newValue: { minerId: miner.id, minerName: miner.name, quantity },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({ ok: true, message: `${quantity} ${miner.name} adicionada(s) ao inventário.` });
  } catch (error: unknown) {
    log.error("[admin send miner]", { error: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to grant miner." });
  }
}

async function setBan(req: Request, res: Response, isBanned: boolean): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", message: "ID de usuário inválido.", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const bodyParsed = adminBanUserSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }
    const { reason, days } = bodyParsed.data;

    const target = await usersAdminRepo.findUserForBan(userId);
    if (!target) {
      res.status(404).json({ ok: false, code: "not_found", message: "Usuário não encontrado." });
      return;
    }

    const bannedUntil = isBanned && days ? new Date(Date.now() + days * 86_400_000) : null;
    const updated = await usersAdminRepo.setUserBanState(userId, {
      isBanned,
      banReason: isBanned ? reason || "Admin ban" : reason ?? null,
      bannedAt: isBanned ? new Date() : null,
      bannedUntil,
      bannedByAdminId: adminActorId(req),
    });

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: isBanned ? "ADMIN_BAN_USER" : "ADMIN_UNBAN_USER",
      module: "users",
      resource: "User",
      resourceId: String(userId),
      newValue: { isBanned, reason, days, bannedUntil },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({
      ok: true,
      message: isBanned ? "User banned" : "User unbanned",
      user: updated,
    });
  } catch (error: unknown) {
    log.error("[admin ban]", { error: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Update failed" });
  }
}

export const banUserHandler = (req: Request, res: Response) => setBan(req, res, true);
export const unbanUserHandler = (req: Request, res: Response) => setBan(req, res, false);

const CURRENCY_FIELD: Record<AdminBalanceCurrency, string> = {
  pol: "polBalance",
  blk: "blkBalance",
  blkLocked: "blkLocked",
  shib: "shibBalance",
  btc: "btcBalance",
  eth: "ethBalance",
  usdt: "usdtBalance",
  usdc: "usdcBalance",
  zer: "zerBalance",
};

export async function adjustBalanceHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", message: "ID inválido.", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const bodyParsed = adminAdjustBalanceSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }
    const { currency, mode, amount, reason } = bodyParsed.data;
    const field = CURRENCY_FIELD[currency];

    let adjusted;
    try {
      adjusted = await usersAdminRepo.adjustUserBalanceFieldTx(
        userId,
        field,
        (prevValue) => (mode === "set" ? amount : prevValue + amount)
      );
    } catch (err: unknown) {
      if (err instanceof usersAdminRepo.NegativeBalanceError) {
        res.status(400).json({ ok: false, code: "negative_balance", message: err.message });
        return;
      }
      throw err;
    }

    if (!adjusted) {
      res.status(404).json({ ok: false, code: "not_found", message: "Usuário não encontrado." });
      return;
    }

    const { before, prevValue, nextValue } = adjusted;
    const updated = await usersAdminRepo.findUserFieldForBalanceAdjust(userId, field);

    await usersAdminRepo.createBalanceAdjustAuditLog({
      userId,
      label: `${currency.toUpperCase()} ${mode} ${amount}`,
      description: reason || null,
      metadata: {
        currency,
        field,
        mode,
        amount,
        prev: prevValue,
        next: nextValue,
        delta: nextValue - prevValue,
        targetEmail: (before as { email?: string }).email,
      },
    });

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_ADJUST_BALANCE",
      module: "users",
      resource: "User",
      resourceId: String(userId),
      newValue: { currency, field, mode, amount, prevValue, nextValue, delta: nextValue - prevValue },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({
      ok: true,
      user: updated,
      prev: prevValue,
      next: nextValue,
      delta: nextValue - prevValue,
    });
  } catch (err: unknown) {
    log.error("[admin adjust-balance]", { error: adminErrMessage(err) });
    res.status(500).json({ ok: false, message: "Erro ao ajustar saldo." });
  }
}

export async function unlockUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", message: "ID de usuário inválido.", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const count = await usersAdminRepo.deleteSecLockCallbacks(userId);
    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_UNLOCK_ACCOUNT",
      module: "users",
      resource: "User",
      resourceId: String(userId),
      newValue: { rowsDeleted: count },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });
    res.json({ ok: true, message: `Bloqueio removido (${count} registro(s) apagado(s)).` });
  } catch (error: unknown) {
    log.error("admin.unlock.error", { message: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Erro ao desbloquear conta." });
  }
}

export async function resetUserPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", message: "ID de usuário inválido.", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const user = await usersAdminRepo.findUserForPasswordReset(userId);
    if (!user) {
      res.status(404).json({ ok: false, code: "not_found", message: "Usuário não encontrado." });
      return;
    }

    const bodyParsed = adminResetPasswordSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }

    const manualPassword = bodyParsed.data.newPassword;
    const newPassword =
      manualPassword ||
      (() => {
        const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
        return Array.from(crypto.randomBytes(14))
          .map((b) => charset[b % charset.length])
          .join("");
      })();

    const passwordHash = await hashPassword(newPassword);
    await usersAdminRepo.updateUserPasswordHash(userId, passwordHash);

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_PASSWORD_RESET",
      module: "users",
      resource: "User",
      resourceId: String(userId),
      newValue: { manual: Boolean(manualPassword) },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({
      ok: true,
      message: "Senha redefinida com sucesso.",
      generatedPassword: manualPassword ? undefined : newPassword,
    });
  } catch (error: unknown) {
    log.error("admin.reset-password.error", { message: adminErrMessage(error) });
    res.status(500).json({ ok: false, message: "Erro ao redefinir senha." });
  }
}

export async function getUserWalletLedgerHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", message: "Invalid user id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        polBalance: true,
        btcBalance: true,
        ethBalance: true,
        usdtBalance: true,
        usdcBalance: true,
        zerBalance: true,
        blkBalance: true,
        blkLocked: true,
        totalWithdrawn: true,
        walletAddress: true,
      },
    });

    if (!user) {
      res.status(404).json({ ok: false, code: "not_found", message: "User not found" });
      return;
    }

    const toNum = (d: unknown) => (d == null ? null : Number(d));
    res.json({
      ok: true,
      userId,
      balances: {
        pol: toNum(user.polBalance),
        btc: toNum(user.btcBalance),
        eth: toNum(user.ethBalance),
        usdt: toNum(user.usdtBalance),
        usdc: toNum(user.usdcBalance),
        zer: toNum(user.zerBalance),
        blk: toNum(user.blkBalance),
        blkLocked: toNum(user.blkLocked),
        totalWithdrawn: toNum(user.totalWithdrawn),
      },
      walletAddress: user.walletAddress,
    });
  } catch (err: unknown) {
    log.error("[users.admin] wallet ledger", { error: adminErrMessage(err) });
    res.status(500).json({ ok: false, message: "Error loading wallet ledger" });
  }
}

export async function getUserActivitySummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = adminUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", message: "Invalid user id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ytSecondsBalance: true, autoMiningSecondsBalance: true, lastHeartbeatAt: true },
    });

    if (!user) {
      res.status(404).json({ ok: false, code: "not_found", message: "User not found" });
      return;
    }

    res.json({ ok: true, userId, session: user });
  } catch (err: unknown) {
    log.error("[users.admin] activity summary", { error: adminErrMessage(err) });
    res.status(500).json({ ok: false, message: "Error loading activity summary" });
  }
}
