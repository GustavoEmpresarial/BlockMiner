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
import { createHash } from "node:crypto";
import { createGenericTelegramOutboxEvent } from "../../modules/notifications/telegram.service.js";
import { slidingWindowAllow, __resetSlidingWindowMemoryForTests } from "../../core/http/middleware/distributedRateLimit.js";

const log = logger.child("Mailer");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "";

let transporter: Transporter | null = null;

/** "jogador@gmail.com" -> "j***@gmail.com": enough to tell recipients apart in logs, not to read them. */
export function maskEmail(addr: string | null | undefined): string {
  const m = /^([^@\s])[^@\s]*@([^@\s]+)$/.exec(String(addr || "").trim());
  return m ? `${m[1]}***@${m[2]}` : "***";
}

/** User-controlled names go into the HTML body. */
function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/*
 * Delivery health. The provider once disabled outbound sending for hours (554 5.7.1) and it only
 * showed up as scattered per-request errors. A streak of failures now raises one alert per
 * cooldown (CRITICAL log + Telegram outbox event) and recovery is logged.
 */
const DELIVERY_ALERT_AFTER_FAILURES = 3;
const DELIVERY_ALERT_COOLDOWN_MS = 30 * 60_000;
/** After the provider says the account is disabled, stop hitting it; one probe per window. */
const ACCOUNT_DISABLED_PAUSE_MS = 30 * 60_000;
/** Any single address (reset / verification / 2FA together): blocks mail-bombing a victim, which is
 *  exactly what gets a sending account flagged. Generous for a real user. */
export const EMAIL_PER_RECIPIENT_MAX_PER_HOUR = 5;
let clockSkewForTests = 0;
const nowMs = () => Date.now() + clockSkewForTests;
const delivery = {
  consecutiveFailures: 0,
  alerted: false,
  lastAlertAt: 0,
  pausedUntil: 0,
  lastFailureAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastResponseCode: null as number | null,
};

export function getEmailDeliveryHealth() {
  const { alerted: _a, lastAlertAt: _l, pausedUntil, ...pub } = delivery;
  return {
    ...pub,
    failing: delivery.consecutiveFailures >= DELIVERY_ALERT_AFTER_FAILURES || pausedUntil > nowMs(),
    paused: pausedUntil > nowMs(),
    pausedUntil: pausedUntil > nowMs() ? new Date(pausedUntil).toISOString() : null,
  };
}

/** @internal tests only */
export function __resetEmailDeliveryForTests(): void {
  clockSkewForTests = 0;
  Object.assign(delivery, { consecutiveFailures: 0, alerted: false, lastAlertAt: 0, pausedUntil: 0, lastFailureAt: null, lastSuccessAt: null, lastResponseCode: null });
  __resetSlidingWindowMemoryForTests();
}

/** @internal tests only */
export function __advanceEmailPauseForTests(ms: number): void {
  clockSkewForTests += ms;
}

class MailerRefusedError extends Error {
  constructor(public code: "EMAIL_SENDING_DISABLED" | "EMAIL_SENDING_PAUSED" | "EMAIL_RECIPIENT_RATE_LIMITED", message: string) {
    super(message);
    this.name = "MailerRefusedError";
  }
}

function isAccountDisabled(e: { responseCode?: number; message?: string }): boolean {
  return e?.responseCode === 554 || /outbound sending is disabled|5\.7\.1/i.test(String(e?.message || ""));
}

async function raiseDeliveryAlert(details: Record<string, unknown>): Promise<void> {
  delivery.lastAlertAt = nowMs();
  delivery.alerted = true;
  log.error("EMAIL_DELIVERY_FAILING", details);
  await createGenericTelegramOutboxEvent("email_delivery_failing", details, { usernameSnapshot: "system" }).catch(() => undefined);
}

async function deliver(tx: Transporter, mail: { to: string; subject: string; text: string; html: string }, kind: string): Promise<void> {
  if (process.env.EMAIL_SENDING_DISABLED === "1") {
    log.warn("EMAIL_SENDING_DISABLED", { kind, to: maskEmail(mail.to) });
    throw new MailerRefusedError("EMAIL_SENDING_DISABLED", "Email sending is switched off (EMAIL_SENDING_DISABLED=1).");
  }
  if (delivery.pausedUntil > nowMs()) {
    log.warn("EMAIL_SENDING_PAUSED", { kind, to: maskEmail(mail.to), pausedUntil: new Date(delivery.pausedUntil).toISOString() });
    throw new MailerRefusedError("EMAIL_SENDING_PAUSED", "Email provider rejected the account; sending paused.");
  }
  const recipientKey = createHash("sha256").update(String(mail.to).trim().toLowerCase()).digest("hex");
  const quota = await slidingWindowAllow({ dedupeKey: recipientKey, windowMs: 60 * 60_000, max: EMAIL_PER_RECIPIENT_MAX_PER_HOUR, redisPrefix: "mail:rcpt" });
  if (!quota.ok) {
    log.warn("EMAIL_RECIPIENT_RATE_LIMITED", { kind, to: maskEmail(mail.to), retryAfterSec: quota.retryAfterSec });
    throw new MailerRefusedError("EMAIL_RECIPIENT_RATE_LIMITED", "Too many emails to this address; try again later.");
  }
  try {
    await tx.sendMail({ from: SMTP_FROM, ...mail });
  } catch (err) {
    const e = err as { responseCode?: number; code?: string; message?: string };
    delivery.consecutiveFailures += 1;
    delivery.lastFailureAt = new Date().toISOString();
    delivery.lastResponseCode = typeof e?.responseCode === "number" ? e.responseCode : null;
    const base = {
      severity: "CRITICAL",
      impact: "HIGH",
      category: "EXTERNAL_API",
      consecutiveFailures: delivery.consecutiveFailures,
      responseCode: delivery.lastResponseCode,
      errorCode: e?.code ?? null,
      lastKind: kind,
    };
    if (isAccountDisabled(e)) {
      // Definitive: retrying a disabled account only adds rejected attempts on the provider side.
      const wasPaused = delivery.pausedUntil > 0;
      delivery.pausedUntil = nowMs() + ACCOUNT_DISABLED_PAUSE_MS;
      if (!wasPaused || nowMs() - delivery.lastAlertAt >= DELIVERY_ALERT_COOLDOWN_MS) {
        await raiseDeliveryAlert({ ...base, reason: "ACCOUNT_DISABLED", pausedForMin: ACCOUNT_DISABLED_PAUSE_MS / 60_000 });
      }
    } else if (delivery.consecutiveFailures >= DELIVERY_ALERT_AFTER_FAILURES && nowMs() - delivery.lastAlertAt >= DELIVERY_ALERT_COOLDOWN_MS) {
      await raiseDeliveryAlert({ ...base, reason: "CONSECUTIVE_FAILURES" });
    }
    throw err;
  }
  delivery.pausedUntil = 0;
  if (delivery.alerted) log.info("EMAIL_DELIVERY_RECOVERED", { afterFailures: delivery.consecutiveFailures });
  delivery.consecutiveFailures = 0;
  delivery.alerted = false;
  delivery.lastSuccessAt = new Date().toISOString();
  log.info(`${kind} email sent`, { to: maskEmail(mail.to) });
}

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
    log.warn("sendPasswordResetEmail called without SMTP configured — no-op", { to: maskEmail(input.to) });
    return;
  }

  const safeName = input.name || "Miner";
  const safeTtl = Number(input.ttlMinutes || 20);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Redefinição de Senha</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${escapeHtml(safeName)}.</p>
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

  await deliver(tx, { to: input.to, subject: "BlockMiner - Redefinição de Senha", text, html }, "Password reset");
}

/** item 95 Parte B: mesmo padrão de sendPasswordResetEmail — best-effort, no-op sem SMTP. */
export async function sendEmailVerificationEmail(input: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    log.warn("sendEmailVerificationEmail called without SMTP configured — no-op", { to: maskEmail(input.to) });
    return;
  }

  const safeName = input.name || "Miner";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Confirme seu e-mail</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${escapeHtml(safeName)}.</p>
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

  await deliver(tx, { to: input.to, subject: "BlockMiner - Confirme seu e-mail", text, html }, "Email verification");
}

export async function sendLoginTwoFactorCodeEmail(input: {
  to: string;
  name: string;
  code: string;
  ttlMinutes: number;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    log.warn("sendLoginTwoFactorCodeEmail called without SMTP configured — no-op", { to: maskEmail(input.to) });
    return;
  }

  const safeName = input.name || "Miner";
  const safeCode = String(input.code || "").trim();
  const safeTtl = Number(input.ttlMinutes || 10);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#22c55e;">BlockMiner - Código de verificação de login</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${escapeHtml(safeName)}.</p>
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

  await deliver(tx, { to: input.to, subject: "BlockMiner - Código de verificação de login", text, html }, "Login 2FA");
}
