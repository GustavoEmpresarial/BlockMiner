// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { authenticator } from "otplib";
import qrcode from "qrcode";
import * as userRepo from "./user.repository.js";
import { getUserReferralStats } from "../referrals/index.js";
import { isSmtpConfigured } from "../../shared/security/mailer.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { reportError } from "../../core/errors/index.js";
function clientIp(req) {
    const xReal = req.headers["x-real-ip"];
    const xff = req.headers["x-forwarded-for"];
    const fromXReal = typeof xReal === "string" ? xReal : Array.isArray(xReal) ? xReal[0] : undefined;
    const fromXff = typeof xff === "string" ? xff.split(",")[0]?.trim() : Array.isArray(xff) ? xff[0] : undefined;
    return fromXReal || fromXff || req.ip;
}
function user2fa(user) {
    return user;
}
function user2faUpdate(data) {
    return data;
}
export async function changeUsername(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const { username } = req.body;
        const userId = sessionUser.id;
        if (!username || typeof username !== "string" || username.trim().length < 3) {
            res.status(400).json({ ok: false, message: "Nome de usuário inválido." });
            return;
        }
        // item 95 (pentest A5): mesma regex já usada no registro (registerBodySchema.ts) — antes
        // era reforçada só na criação da conta, e change-username aceitava qualquer caractere
        // (incluindo `<`/`>`), armazenado raw e reexibido no chat/session/ranking.
        if (!/^[a-zA-Z0-9._-]+$/.test(username.trim())) {
            res.status(400).json({ ok: false, message: "Nome de usuário inválido." });
            return;
        }
        const existing = await userRepo.findUsernameConflict(username.trim(), userId);
        if (existing) {
            res.status(409).json({ ok: false, message: "Nome de usuário já está em uso." });
            return;
        }
        await userRepo.updateUsername(userId, username.trim());
        res.json({ ok: true, message: "Nome de usuário alterado com sucesso." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao alterar o nome de usuário." });
    }
}
export async function generate2FA(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const userRaw = await userRepo.findUserById(sessionUser.id);
        if (!userRaw) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        const user = user2fa(userRaw);
        if (user.isTwoFactorEnabled) {
            res.status(400).json({ ok: false, message: "2FA já está ativado." });
            return;
        }
        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email, "BlockMiner", secret);
        const qrCodeUrl = await qrcode.toDataURL(otpauth);
        await userRepo.updateUser2FAFields(sessionUser.id, user2faUpdate({ twoFactorSecret: secret }));
        res.json({ ok: true, qrCodeUrl, secret });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao gerar 2FA." });
    }
}
export async function enable2FA(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const { token } = req.body;
        const userRaw = await userRepo.findUserById(sessionUser.id);
        if (!userRaw) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        const user = user2fa(userRaw);
        if (user.isTwoFactorEnabled) {
            res.status(400).json({ ok: false, message: "2FA já está ativado." });
            return;
        }
        if (!user.twoFactorSecret) {
            res.status(400).json({ ok: false, message: "Gere o 2FA primeiro." });
            return;
        }
        if (typeof token !== "string" || !authenticator.check(token, user.twoFactorSecret)) {
            res.status(400).json({ ok: false, message: "Código inválido." });
            return;
        }
        await userRepo.updateUser2FAFields(sessionUser.id, user2faUpdate({ isTwoFactorEnabled: true }));
        res.json({ ok: true, message: "2FA ativado com sucesso." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao ativar 2FA." });
    }
}
export async function disable2FA(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const { token } = req.body;
        const userRaw = await userRepo.findUserById(sessionUser.id);
        if (!userRaw) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        const user = user2fa(userRaw);
        if (!user.isTwoFactorEnabled) {
            res.status(400).json({ ok: false, message: "2FA não está ativado." });
            return;
        }
        if (typeof token !== "string" || !user.twoFactorSecret || !authenticator.check(token, user.twoFactorSecret)) {
            res.status(400).json({ ok: false, message: "Código inválido." });
            return;
        }
        await userRepo.updateUser2FAFields(sessionUser.id, user2faUpdate({ isTwoFactorEnabled: false, twoFactorSecret: null }));
        res.json({ ok: true, message: "2FA desativado com sucesso." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao desativar 2FA." });
    }
}
export async function get2FAStatus(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const userRaw = await userRepo.findUserById(sessionUser.id);
        if (!userRaw) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        res.json({ ok: true, isTwoFactorEnabled: Boolean(user2fa(userRaw).isTwoFactorEnabled) });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao obter status." });
    }
}
export async function reportAdblock(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const { detected } = req.body;
        await userRepo.createAdblockAuditLog({
            userId: sessionUser.id,
            action: "adblock_detected",
            metadata: {
                detected: typeof detected === "boolean" ? detected : detected != null && (typeof detected === "string" || typeof detected === "number") ? String(detected) : null,
                ip: req.ip ?? null,
                userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
            },
        });
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ ok: false });
    }
}
export async function getReferrals(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const referrals = await userRepo.listReferralsForUser(sessionUser.id);
        res.json({ ok: true, referrals });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao obter referidos." });
    }
}
export async function getReferralStats(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const stats = await getUserReferralStats(sessionUser.id);
        res.json({ ok: true, ...stats });
    }
    catch (err) {
        if (err instanceof Error && err.message === "user_not_found") {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        res.status(500).json({ ok: false, message: "Erro ao obter estatísticas de indicações." });
    }
}
export async function linkReferral(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const userId = sessionUser.id;
        const { refCode } = req.body;
        if (!refCode || typeof refCode !== "string" || !refCode.trim()) {
            res.status(400).json({ ok: false, message: "Código de indicação inválido." });
            return;
        }
        const existing = await userRepo.findReferralByReferredId(userId);
        if (existing) {
            res.status(409).json({ ok: false, message: "Você já possui um indicador vinculado." });
            return;
        }
        // item 97 (pentest): atalho por ID numérico REMOVIDO — ver auth.repository.ts's
        // resolveReferrerFromRefInput pro raciocínio completo (mesmo fix, mesmo motivo).
        // Usuários antigos não são afetados: o refCode deles continua igual e funcionando.
        const raw = refCode.trim();
        const referrer = await userRepo.findUserByRefCode(raw);
        if (!referrer) {
            res.status(404).json({ ok: false, message: "Código de indicação não encontrado." });
            return;
        }
        if (referrer.id === userId) {
            res.status(400).json({ ok: false, message: "Você não pode se auto-indicar." });
            return;
        }
        const cip = clientIp(req);
        if (referrer.ip && cip && referrer.ip === cip) {
            res.status(400).json({ ok: false, message: "Não é permitido vincular um indicador da mesma rede." });
            return;
        }
        await userRepo.createReferralAndLinkTx(referrer.id, userId);
        res.json({ ok: true, message: "Indicador vinculado com sucesso!" });
    }
    catch (error) {
        reportError({
            code: "LINK_REFERRAL_FAILED",
            category: "BUSINESS",
            severity: "ERROR",
            module: "users.linkReferral",
            error,
            req,
        });
        res.status(500).json({ ok: false, message: "Erro ao vincular indicador." });
    }
}
export async function getEmailTwoFactorStatus(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const user = await userRepo.findUserEmailTwoFactorEnabled(sessionUser.id);
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        res.json({ ok: true, enabled: user.emailTwoFactorEnabled });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao obter status." });
    }
}
export async function requestEmailTwoFactorChallenge(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        if (!isSmtpConfigured()) {
            res.status(503).json({ ok: false, message: "Email verification unavailable." });
            return;
        }
        const user = await userRepo.findUserEmailAndName(sessionUser.id);
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        // Real challenge issuance/send is deferred with SMTP transport (see class doc-comment).
        res.status(503).json({ ok: false, message: "Email verification unavailable." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao enviar código." });
    }
}
export async function enableEmailTwoFactor(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    res.status(503).json({ ok: false, message: "Email verification unavailable." });
}
export async function disableEmailTwoFactor(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        await userRepo.setEmailTwoFactorEnabled(sessionUser.id, false);
        res.json({ ok: true, message: "Verificação em duas etapas desativada." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao desativar 2FA." });
    }
}
