// @ts-nocheck — restored from dist for compile; refine later
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { isAdminKeyedPasswordResetApiEnabled } from "../../shared/security/adminPasswordResetPolicy.js";
import { isSmtpConfigured, sendPasswordResetEmail, sendEmailVerificationEmail } from "../../shared/security/mailer.js";
import { timingSafeAdminSecretEqual } from "../../shared/security/cookies.js";
import { unknownErrorMessage } from "../../shared/errors/prismaHttpErrors.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { APP_URL, PASSWORD_RESET_TOKEN_TTL, comparePassword, hashPassword, signPasswordResetToken, verifyPasswordResetToken, signEmailVerificationToken, verifyEmailVerificationToken, } from "./auth.service.js";
import { findUserByIdentifier, normalizeEmail } from "./auth.repository.js";
const log = logger.child("AuthController");
export async function legacyPasswordResetPost(req, res) {
    try {
        const { resetToken, newPassword } = req.body;
        const newPasswordLen = String(newPassword ?? "").length;
        if (!resetToken || !newPassword || newPasswordLen < 8 || newPasswordLen > 72) {
            res.status(400).json({ ok: false, message: "Dados inválidos." });
            return;
        }
        const payload = verifyPasswordResetToken(resetToken);
        if (!payload?.sub) {
            res.status(401).json({ ok: false, message: "Token de reset inválido ou expirado." });
            return;
        }
        const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
        if (!user) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        const newPasswordHash = await hashPassword(String(newPassword), 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newPasswordHash } });
        log.info("Legacy password reset completed", { userId: user.id, ip: req.ip });
        res.json({ ok: true, message: "Sua senha foi atualizada com sucesso. Agora você já pode logar!" });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao resetar senha de migração." });
    }
}
export async function resetPasswordManualPost(req, res) {
    try {
        if (!isAdminKeyedPasswordResetApiEnabled()) {
            res.status(404).json({ ok: false, message: "Not found." });
            return;
        }
        const { email, newPassword, adminKey } = req.body;
        if (!timingSafeAdminSecretEqual(adminKey, process.env.ADMIN_SECURITY_CODE)) {
            res.status(403).json({ ok: false, message: "Unauthorized manual reset." });
            return;
        }
        const manualPasswordLen = String(newPassword ?? "").length;
        if (manualPasswordLen < 8 || manualPasswordLen > 72) {
            res.status(400).json({ ok: false, message: "Nova senha inválida." });
            return;
        }
        const user = await prisma.user.findUnique({ where: { email: String(email ?? "") } });
        if (!user) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        const newPasswordHash = await hashPassword(String(newPassword ?? ""), 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newPasswordHash } });
        log.info(`Manual password reset for ${String(email ?? "")}`);
        res.json({ ok: true, message: "Senha alterada com sucesso." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro no reset manual." });
    }
}
export async function forgotPasswordPost(req, res) {
    try {
        const { email } = req.body;
        if (!email || String(email).trim().length === 0) {
            res.status(400).json({ ok: false, message: "Email é obrigatório." });
            return;
        }
        const normalizedEmail = normalizeEmail(email);
        const user = await findUserByIdentifier(normalizedEmail);
        if (!user || !isSmtpConfigured()) {
            if (!user) {
                // Do not reveal whether the account exists.
            }
            else {
                log.warn("Password reset requested but SMTP is not configured; no email sent.", { normalizedEmail });
            }
            res.json({ ok: true, message: "Se o email existe, você receberá instruções de redefinição." });
            return;
        }
        const resetToken = signPasswordResetToken(user.id);
        const resetUrl = `${APP_URL.replace(/\/$/, "")}/forgot-password?token=${encodeURIComponent(resetToken)}`;
        // item 95 (pentest A1): uma falha de envio (SMTP fora do ar, etc.) AQUI DENTRO não pode
        // vazar como 500 pro chamador — antes isso criava um oráculo de enumeração (email
        // inexistente sempre 200 acima, email existente com falha de SMTP virava 500 aqui). A
        // resposta ao cliente é sempre a mesma genérica, independente do resultado real do envio.
        try {
            await sendPasswordResetEmail({
                to: user.email,
                name: user.name,
                resetUrl,
                ttlMinutes: Number(String(PASSWORD_RESET_TOKEN_TTL).replace(/[^0-9]/g, "")) || 20,
            });
            log.info(`Password reset requested for email: ${normalizedEmail}`);
        }
        catch (sendError) {
            log.error("Password reset email send failed", { normalizedEmail, error: unknownErrorMessage(sendError) });
        }
        res.json({ ok: true, message: "Se o email existe, você receberá instruções de redefinição." });
    }
    catch (error) {
        // Qualquer outra falha inesperada (ex.: erro de DB no findUserByIdentifier) também não
        // pode diferenciar a resposta — mesmo formato genérico, nunca 500 pro caller.
        log.error("Forgot password error", { error: unknownErrorMessage(error) });
        res.json({ ok: true, message: "Se o email existe, você receberá instruções de redefinição." });
    }
}
export async function adminForcePasswordResetPost(req, res) {
    try {
        if (!isAdminKeyedPasswordResetApiEnabled()) {
            res.status(404).json({ ok: false, message: "Not found." });
            return;
        }
        const { email, newPassword, adminKey } = req.body;
        if (!timingSafeAdminSecretEqual(adminKey, process.env.ADMIN_SECURITY_CODE)) {
            res.status(403).json({ ok: false, message: "Chave de admin inválida." });
            return;
        }
        const forcePasswordLen = String(newPassword ?? "").length;
        if (!newPassword || forcePasswordLen < 8 || forcePasswordLen > 72) {
            res.status(400).json({ ok: false, message: "Nova senha inválida." });
            return;
        }
        const normalizedEmail = normalizeEmail(email);
        const user = await findUserByIdentifier(normalizedEmail);
        if (!user) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        const newPasswordHash = await hashPassword(String(newPassword), 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newPasswordHash } });
        log.info(`[ADMIN] Force password reset completed for email: ${normalizedEmail}`);
        res.json({ ok: true, message: "Senha redefinida com sucesso." });
    }
    catch (error) {
        log.error("Admin force reset error", { error: unknownErrorMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao forçar redefinição de senha." });
    }
}
export async function changePasswordPost(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
        if (!user || !(await comparePassword(String(currentPassword ?? ""), user.passwordHash))) {
            res.status(401).json({ ok: false, message: "Senha atual incorreta." });
            return;
        }
        const newPasswordHash = await hashPassword(String(newPassword ?? ""), 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newPasswordHash } });
        res.json({ ok: true, message: "Senha alterada com sucesso." });
    }
    catch {
        res.status(500).json({ ok: false, message: "Erro ao alterar senha." });
    }
}
/**
 * item 95 Parte B — POST /api/auth/verify-email {token}.
 * Idempotente: se o usuário já estiver verificado, responde 200 sem erro (link clicado
 * duas vezes, ou usuário antigo já backfillado que clica num link velho por engano).
 */
export async function verifyEmailPost(req, res) {
    try {
        const { token } = req.body;
        if (!token || typeof token !== "string") {
            res.status(400).json({ ok: false, message: "Token é obrigatório." });
            return;
        }
        const payload = verifyEmailVerificationToken(token);
        if (!payload?.sub) {
            res.status(401).json({ ok: false, message: "Token de verificação inválido ou expirado." });
            return;
        }
        const userId = Number(payload.sub);
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, emailVerifiedAt: true } });
        if (!user) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        if (!user.emailVerifiedAt) {
            await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
            log.security("AUTH_EMAIL_VERIFIED", { userId }, req);
        }
        res.json({ ok: true, message: "E-mail confirmado com sucesso." });
    }
    catch (error) {
        log.error("Verify email error", { error: unknownErrorMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao confirmar e-mail." });
    }
}
/**
 * item 95 Parte B — POST /api/auth/resend-verification (requireAuth + rate limit, ver
 * auth.routes.ts). Reenvia só se o usuário logado ainda não estiver verificado.
 */
export async function resendVerificationPost(req, res) {
    const sessionUser = requireSessionUser(req, res);
    if (!sessionUser)
        return;
    try {
        const user = await prisma.user.findUnique({
            where: { id: sessionUser.id },
            select: { id: true, name: true, email: true, emailVerifiedAt: true },
        });
        if (!user) {
            res.status(404).json({ ok: false, message: "Usuário não encontrado." });
            return;
        }
        if (user.emailVerifiedAt) {
            res.json({ ok: true, message: "Seu e-mail já está confirmado." });
            return;
        }
        if (!isSmtpConfigured()) {
            res.status(503).json({ ok: false, message: "Envio de e-mail indisponível no momento." });
            return;
        }
        const verifyToken = signEmailVerificationToken(user.id);
        const verifyUrl = `${APP_URL.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(verifyToken)}`;
        try {
            await sendEmailVerificationEmail({ to: user.email, name: user.name, verifyUrl });
        } catch (sendErr) {
            log.error("Resend verification email send failed", { error: unknownErrorMessage(sendErr), userId: user.id });
            res.status(503).json({
                ok: false,
                code: "EMAIL_SEND_FAILED",
                message: "Envio de e-mail temporariamente indisponível no momento. Tente novamente mais tarde.",
            });
            return;
        }
        res.json({ ok: true, message: "Reenviamos o e-mail de confirmação." });
    }
    catch (error) {
        log.error("Resend verification error", { error: unknownErrorMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao reenviar confirmação." });
    }
}
