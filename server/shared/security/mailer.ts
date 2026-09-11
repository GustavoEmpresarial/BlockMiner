/**
 * Real SMTP transport (nodemailer). Ported from legacy/server/utils/mailer.ts —
 * previously a no-op stub (Fase 1) that only ever logged intent, never sent anything.
 * That silently broke two real flows once SMTP_* stopped being empty: forgot-password
 * told the user "email sent" with nothing arriving, and email-2FA locked users out
 * entirely (the generated code was never delivered anywhere). See docs/PROGRESSO.txt
 * security-audit entry for the full incident.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../../core/logger/index.js";

const log = logger.child("Mailer");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "";

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
  ttlMinutes: number;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    log.warn("sendPasswordResetEmail called without SMTP configured — no-op", { to: input.to });
    return;
  }

  const safeName = input.name || "Miner";
  const safeTtl = Number(input.ttlMinutes || 20);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Redefinição de Senha</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Recebemos uma solicitação para redefinir sua senha.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${input.resetUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Redefinir senha agora</a>
      </p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">Este link expira em ${safeTtl} minutos.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Se você não solicitou, ignore este e-mail.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Redefinição de Senha",
    "",
    `Olá, ${safeName}.`,
    "Recebemos uma solicitação para redefinir sua senha.",
    "",
    `Abra este link: ${input.resetUrl}`,
    "",
    `Este link expira em ${safeTtl} minutos.`,
    "Se você não solicitou, ignore este e-mail.",
  ].join("\n");

  await tx.sendMail({ from: SMTP_FROM, to: input.to, subject: "BlockMiner - Redefinição de Senha", text, html });
  log.info("Password reset email sent", { to: input.to });
}

/** item 95 Parte B: mesmo padrão de sendPasswordResetEmail — best-effort, no-op sem SMTP. */
export async function sendEmailVerificationEmail(input: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    log.warn("sendEmailVerificationEmail called without SMTP configured — no-op", { to: input.to });
    return;
  }

  const safeName = input.name || "Miner";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Confirme seu e-mail</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Confirme seu e-mail pra liberar saques e o chat da plataforma.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${input.verifyUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Confirmar e-mail agora</a>
      </p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">Este link expira em 24 horas.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Se você não criou uma conta no BlockMiner, ignore este e-mail.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Confirme seu e-mail",
    "",
    `Olá, ${safeName}.`,
    "Confirme seu e-mail pra liberar saques e o chat da plataforma.",
    "",
    `Abra este link: ${input.verifyUrl}`,
    "",
    "Este link expira em 24 horas.",
    "Se você não criou uma conta no BlockMiner, ignore este e-mail.",
  ].join("\n");

  await tx.sendMail({ from: SMTP_FROM, to: input.to, subject: "BlockMiner - Confirme seu e-mail", text, html });
  log.info("Email verification email sent", { to: input.to });
}

export async function sendLoginTwoFactorCodeEmail(input: {
  to: string;
  name: string;
  code: string;
  ttlMinutes: number;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    log.warn("sendLoginTwoFactorCodeEmail called without SMTP configured — no-op", { to: input.to });
    return;
  }

  const safeName = input.name || "Miner";
  const safeCode = String(input.code || "").trim();
  const safeTtl = Number(input.ttlMinutes || 10);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#22c55e;">BlockMiner - Código de verificação de login</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Use o código abaixo pra concluir seu login:</p>
      <p style="margin:0 0 18px 0;font-size:28px;letter-spacing:4px;font-weight:700;color:#f8fafc;">${safeCode}</p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">Este código expira em ${safeTtl} minutos.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Se não foi você, ignore este e-mail e troque sua senha.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Código de verificação de login",
    "",
    `Olá, ${safeName}.`,
    "Use este código pra concluir seu login:",
    safeCode,
    "",
    `Este código expira em ${safeTtl} minutos.`,
    "Se não foi você, ignore este e-mail e troque sua senha.",
  ].join("\n");

  await tx.sendMail({ from: SMTP_FROM, to: input.to, subject: "BlockMiner - Código de verificação de login", text, html });
  log.info("Login 2FA email sent", { to: input.to });
}
