// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Admin user-management. Simplified port of legacy
 * server/modules/users/users.admin.routes.ts (verbatim from routes/admin.ts
 * originally).
 *
 * Deviations (documented — see README.md):
 *  - The detail dossier deliberately exposes only data currently owned by
 *    Prisma's identity, inventory, and audit models. Transactions, tickets,
 *    related-account investigation, and antibot evidence remain in their
 *    owning modules. Miner grants use inventory's public transaction API.
 *  - `adminUserInsights` (wallet-ledger, activity-summary — the
 *    `adminUserInsights → users.admin` merge from the plan) is implemented
 *    in reduced form: wallet-ledger reports balances only (no
 *    transactions/ccpayment history — those tables belong to the
 *    wallet/deposits modules, Fase 2+).
 */
import crypto from "node:crypto";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { hashPassword } from "../../shared/security/password.js";
import * as usersAdminRepo from "./usersAdmin.repository.js";
import { logAdminAction } from "../admin/index.js";
import { grantPurchasedInventoryItems } from "../inventory/index.js";
const log = logger.child("UsersAdmin");
function adminErrMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function parseStrictPositiveUserId(raw) {
    const s = String(raw ?? "").trim();
    if (!/^\d{1,12}$/.test(s))
        return null;
    const n = Number(s);
    if (!Number.isSafeInteger(n) || n < 1)
        return null;
    return n;
}
export async function listUsersHandler(req, res) {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
        const data = await usersAdminRepo.listUsers({
            page,
            pageSize,
            query: typeof req.query.query === "string" ? req.query.query : undefined,
            fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
            toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
        });
        res.json({ ok: true, ...data });
    }
    catch (error) {
        log.error("[admin users list]", { error: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to load users." });
    }
}
export async function getUserDetailHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "Invalid user id" });
            return;
        }
        const user = await usersAdminRepo.getUserDetail(userId);
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found" });
            return;
        }
        // Computed metrics (live hashrate, faucet claims, deposit/withdrawal totals, IP
        // intelligence, etc.) — separate query from the raw profile row, same split legacy used.
        const metrics = await usersAdminRepo.getUserProfileMetrics(userId, user.ip);
        res.json({ ok: true, user, metrics });
    }
    catch (error) {
        log.error("[admin user detail]", { error: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to load user detail." });
    }
}
async function requireExistingUser(userId, res) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (user)
        return true;
    res.status(404).json({ ok: false, message: "User not found" });
    return false;
}
export async function getUserTicketsHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "Invalid user id" });
            return;
        }
        if (!(await requireExistingUser(userId, res)))
            return;
        const tickets = await usersAdminRepo.listUserSupportTickets(userId);
        res.json({ ok: true, userId, tickets });
    }
    catch (error) {
        log.error("[admin user tickets]", { error: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to load user tickets." });
    }
}
export async function getRelatedUsersHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "Invalid user id" });
            return;
        }
        if (!(await requireExistingUser(userId, res)))
            return;
        const related = await usersAdminRepo.listRelatedUsers(userId);
        res.json({ ok: true, userId, related });
    }
    catch (error) {
        log.error("[admin user related]", { error: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to load related accounts." });
    }
}
export async function sendMinerHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        const minerId = parseStrictPositiveUserId(req.body?.minerId);
        const quantity = Number(req.body?.quantity);
        if (!userId || !minerId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
            res.status(400).json({ ok: false, message: "Invalid user, miner, or quantity (1-50)." });
            return;
        }
        const [user, miner] = await Promise.all([
            usersAdminRepo.findUserForBan(userId),
            usersAdminRepo.findGrantableMiner(minerId),
        ]);
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found" });
            return;
        }
        if (!miner) {
            res.status(404).json({ ok: false, message: "Active miner not found" });
            return;
        }
        await prisma.$transaction(async (tx) => {
            await grantPurchasedInventoryItems(tx, userId, {
                minerId: miner.id,
                minerName: miner.name,
                hashRate: miner.baseHashRate,
                slotSize: miner.slotSize,
                imageUrl: miner.imageUrl,
                snapshotSlug: miner.slug,
                snapshotPrice: Number(miner.price),
                acquisitionSource: "admin_grant",
            }, quantity, new Date());
        });
        await logAdminAction({
            adminId: req.admin?.adminId ?? null,
            action: "ADMIN_GRANT_MINER",
            module: "users",
            resource: "User",
            resourceId: String(userId),
            newValue: { minerId: miner.id, minerName: miner.name, quantity },
        });
        res.json({ ok: true, message: `${quantity} ${miner.name} added to inventory.` });
    }
    catch (error) {
        log.error("[admin send miner]", { error: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to grant miner." });
    }
}
async function setBan(req, res, isBanned) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "ID de usuário inválido." });
            return;
        }
        const body = (req.body ?? {});
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : null;
        const days = body.days != null ? Number(body.days) : null;
        if (days != null && (!Number.isFinite(days) || days <= 0)) {
            res.status(400).json({ ok: false, message: "Invalid ban duration." });
            return;
        }
        const target = await usersAdminRepo.findUserForBan(userId);
        if (!target) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        const bannedUntil = isBanned && days ? new Date(Date.now() + days * 86_400_000) : null;
        const updated = await usersAdminRepo.setUserBanState(userId, {
            isBanned,
            banReason: isBanned ? reason || "Admin ban" : reason,
            bannedAt: isBanned ? new Date() : null,
            bannedUntil,
            bannedByAdminId: req.admin?.adminId ?? null,
        });
        await logAdminAction({
            adminId: req.admin?.adminId ?? null,
            action: isBanned ? "ADMIN_BAN_USER" : "ADMIN_UNBAN_USER",
            module: "users",
            resource: "User",
            resourceId: String(userId),
        });
        res.json({ ok: true, message: isBanned ? "User banned" : "User unbanned", user: updated });
    }
    catch (error) {
        log.error("[admin ban]", { error: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Update failed" });
    }
}
export const banUserHandler = (req, res) => setBan(req, res, true);
export const unbanUserHandler = (req, res) => setBan(req, res, false);
const CURRENCY_FIELD = {
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
export async function adjustBalanceHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "ID inválido." });
            return;
        }
        const body = (req.body ?? {});
        const currency = String(body.currency ?? "").trim();
        const mode = String(body.mode ?? "set").trim();
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
        const field = CURRENCY_FIELD[currency];
        if (!field) {
            res.status(400).json({ ok: false, message: "currency inválido." });
            return;
        }
        if (mode !== "set" && mode !== "add") {
            res.status(400).json({ ok: false, message: "mode inválido (set|add)." });
            return;
        }
        const amount = Number(body.amount);
        if (!Number.isFinite(amount)) {
            res.status(400).json({ ok: false, message: "amount inválido." });
            return;
        }
        let adjusted;
        try {
            adjusted = await usersAdminRepo.adjustUserBalanceFieldTx(userId, field, (prevValue) => mode === "set" ? amount : prevValue + amount);
        }
        catch (err) {
            if (err instanceof usersAdminRepo.NegativeBalanceError) {
                res.status(400).json({ ok: false, message: err.message });
                return;
            }
            throw err;
        }
        if (!adjusted) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        const { before, prevValue, nextValue } = adjusted;
        const updated = await usersAdminRepo.findUserFieldForBalanceAdjust(userId, field);
        await usersAdminRepo.createBalanceAdjustAuditLog({
            userId,
            label: `${currency.toUpperCase()} ${mode} ${amount}`,
            description: reason || null,
            metadata: { currency, field, mode, amount, prev: prevValue, next: nextValue, delta: nextValue - prevValue, targetEmail: before.email },
        });
        res.json({ ok: true, user: updated, prev: prevValue, next: nextValue, delta: nextValue - prevValue });
    }
    catch (err) {
        log.error("[admin adjust-balance]", { error: adminErrMessage(err) });
        res.status(500).json({ ok: false, message: "Erro ao ajustar saldo." });
    }
}
export async function unlockUserHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "ID de usuário inválido." });
            return;
        }
        const count = await usersAdminRepo.deleteSecLockCallbacks(userId);
        await logAdminAction({ adminId: req.admin?.adminId ?? null, action: "ADMIN_UNLOCK_ACCOUNT", module: "users", resource: "User", resourceId: String(userId), newValue: { rowsDeleted: count } });
        res.json({ ok: true, message: `Bloqueio removido (${count} registro(s) apagado(s)).` });
    }
    catch (error) {
        log.error("admin.unlock.error", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao desbloquear conta." });
    }
}
export async function resetUserPasswordHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "ID de usuário inválido." });
            return;
        }
        const user = await usersAdminRepo.findUserForPasswordReset(userId);
        if (!user) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        const manualPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : "";
        if (manualPassword && manualPassword.length < 6) {
            res.status(400).json({ ok: false, message: "A senha deve ter pelo menos 6 caracteres." });
            return;
        }
        const newPassword = manualPassword ||
            (() => {
                const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
                return Array.from(crypto.randomBytes(14)).map((b) => charset[b % charset.length]).join("");
            })();
        const passwordHash = await hashPassword(newPassword);
        await usersAdminRepo.updateUserPasswordHash(userId, passwordHash);
        await logAdminAction({ adminId: req.admin?.adminId ?? null, action: "ADMIN_PASSWORD_RESET", module: "users", resource: "User", resourceId: String(userId), newValue: { manual: Boolean(manualPassword) } });
        res.json({ ok: true, message: "Senha redefinida com sucesso." });
    }
    catch (error) {
        log.error("admin.reset-password.error", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao redefinir senha." });
    }
}
// --- adminUserInsights merge (reduced — see module doc-comment) ---
export async function getUserWalletLedgerHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "Invalid user id" });
            return;
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { polBalance: true, btcBalance: true, ethBalance: true, usdtBalance: true, usdcBalance: true, zerBalance: true, blkBalance: true, blkLocked: true, totalWithdrawn: true, walletAddress: true },
        });
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found" });
            return;
        }
        const toNum = (d) => (d == null ? null : Number(d));
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
    }
    catch (err) {
        log.error("[users.admin] wallet ledger", { error: adminErrMessage(err) });
        res.status(500).json({ ok: false, message: "Error loading wallet ledger" });
    }
}
export async function getUserActivitySummaryHandler(req, res) {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) {
            res.status(400).json({ ok: false, message: "Invalid user id" });
            return;
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { ytSecondsBalance: true, autoMiningSecondsBalance: true, lastHeartbeatAt: true },
        });
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found" });
            return;
        }
        res.json({ ok: true, userId, session: user });
    }
    catch (err) {
        log.error("[users.admin] activity summary", { error: adminErrMessage(err) });
        res.status(500).json({ ok: false, message: "Error loading activity summary" });
    }
}
