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

/*
 * Optional second provider. A single mailbox-SMTP (Hostinger) had its outbound disabled twice in a
 * day; with SMTP_FALLBACK_* set, what the primary cannot take goes out through the fallback in the
 * same call. Each sender has its own pause (circuit breaker).
 */
type Sender = { id: "primary" | "fallback"; from: string; pausedUntil: number; transport: () => Transporter | null };
const FALLBACK = {
  host: process.env.SMTP_FALLBACK_HOST || "",
  port: Number(process.env.SMTP_FALLBACK_PORT || 587),
  secure: String(process.env.SMTP_FALLBACK_SECURE || "false").toLowerCase() === "true",
  user: process.env.SMTP_FALLBACK_USER || "",
  pass: process.env.SMTP_FALLBACK_PASS || "",
  from: process.env.SMTP_FALLBACK_FROM || "",
};
let fallbackTransporter: Transporter | null = null;
const senders: Sender[] = [];

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
  lastFailureAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastResponseCode: null as number | null,
};

function activeSenders(): Sender[] {
  if (senders.length === 0) {
    senders.push({ id: "primary", from: SMTP_FROM, pausedUntil: 0, transport: () => getTransporter() });
    if (FALLBACK.host && FALLBACK.user && FALLBACK.pass && FALLBACK.from) {
      senders.push({
        id: "fallback",
        from: FALLBACK.from,
        pausedUntil: 0,
        transport: () =>
          (fallbackTransporter ??= nodemailer.createTransport({
            host: FALLBACK.host,
            port: FALLBACK.port,
            secure: FALLBACK.secure,
            auth: { user: FALLBACK.user, pass: FALLBACK.pass },
          })),
      });
    }
  }
  return senders;
}

export function getEmailDeliveryHealth() {
  const { alerted: _a, lastAlertAt: _l, ...pub } = delivery;
  const list = activeSenders().map((s) => ({
    id: s.id,
    paused: s.pausedUntil > nowMs(),
    pausedUntil: s.pausedUntil > nowMs() ? new Date(s.pausedUntil).toISOString() : null,
  }));
  const allPaused = list.every((s) => s.paused);
  return {
    ...pub,
    senders: list,
    paused: allPaused,
    failing: delivery.consecutiveFailures >= DELIVERY_ALERT_AFTER_FAILURES || allPaused,
  };
}

/** @internal tests only */
export function __resetEmailDeliveryForTests(): void {
  clockSkewForTests = 0;
  Object.assign(delivery, { consecutiveFailures: 0, alerted: false, lastAlertAt: 0, lastFailureAt: null, lastSuccessAt: null, lastResponseCode: null });
  for (const s of activeSenders()) s.pausedUntil = 0;
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

async function deliver(_primary: Transporter, mail: { to: string; subject: string; text: string; html: string }, kind: string): Promise<void> {
  if (process.env.EMAIL_SENDING_DISABLED === "1") {
    log.warn("EMAIL_SENDING_DISABLED", { kind, to: maskEmail(mail.to) });
    throw new MailerRefusedError("EMAIL_SENDING_DISABLED", "Email sending is switched off (EMAIL_SENDING_DISABLED=1).");
  }
  const ready = activeSenders().filter((s) => s.pausedUntil <= nowMs());
  if (ready.length === 0) {
    log.warn("EMAIL_SENDING_PAUSED", { kind, to: maskEmail(mail.to) });
    throw new MailerRefusedError("EMAIL_SENDING_PAUSED", "Email provider rejected the account; sending paused.");
  }
  const recipientKey = createHash("sha256").update(String(mail.to).trim().toLowerCase()).digest("hex");
  const quota = await slidingWindowAllow({ dedupeKey: recipientKey, windowMs: 60 * 60_000, max: EMAIL_PER_RECIPIENT_MAX_PER_HOUR, redisPrefix: "mail:rcpt" });
  if (!quota.ok) {
    log.warn("EMAIL_RECIPIENT_RATE_LIMITED", { kind, to: maskEmail(mail.to), retryAfterSec: quota.retryAfterSec });
    throw new MailerRefusedError("EMAIL_RECIPIENT_RATE_LIMITED", "Too many emails to this address; try again later.");
  }

  let lastErr: unknown = null;
  for (const sender of ready) {
    const transport = sender.transport();
    if (!transport) continue;
    try {
      await transport.sendMail({ ...mail, from: sender.from });
    } catch (err) {
      lastErr = err;
      const e = err as { responseCode?: number; code?: string; message?: string };
      delivery.lastFailureAt = new Date().toISOString();
      delivery.lastResponseCode = typeof e?.responseCode === "number" ? e.responseCode : null;
      if (isAccountDisabled(e)) {
        // Definitive: retrying a disabled account only adds rejected attempts on the provider side.
        const wasPaused = sender.pausedUntil > 0;
        sender.pausedUntil = nowMs() + ACCOUNT_DISABLED_PAUSE_MS;
        if (!wasPaused || nowMs() - delivery.lastAlertAt >= DELIVERY_ALERT_COOLDOWN_MS) {
          await raiseDeliveryAlert({
            severity: "CRITICAL",
            impact: "HIGH",
            category: "EXTERNAL_API",
            reason: "ACCOUNT_DISABLED",
            sender: sender.id,
            fallbackAvailable: ready.some((s) => s.id !== sender.id),
            responseCode: delivery.lastResponseCode,
            errorCode: e?.code ?? null,
            lastKind: kind,
            pausedForMin: ACCOUNT_DISABLED_PAUSE_MS / 60_000,
          });
        }
      } else {
        log.warn("EMAIL_SENDER_FAILED", { sender: sender.id, errorCode: e?.code ?? null, responseCode: delivery.lastResponseCode, kind });
      }
      continue; // next sender
    }
    sender.pausedUntil = 0;
    if (delivery.alerted) log.info("EMAIL_DELIVERY_RECOVERED", { afterFailures: delivery.consecutiveFailures, sender: sender.id });
    delivery.consecutiveFailures = 0;
    delivery.alerted = false;
    delivery.lastSuccessAt = new Date().toISOString();
    log.info(`${kind} email sent`, { to: maskEmail(mail.to), sender: sender.id });
    return;
  }

  // Every sender failed for this message.
  delivery.consecutiveFailures += 1;
  const e = lastErr as { responseCode?: number; code?: string } | null;
  if (
    !(e && isAccountDisabled(e)) &&
    delivery.consecutiveFailures >= DELIVERY_ALERT_AFTER_FAILURES &&
    nowMs() - delivery.lastAlertAt >= DELIVERY_ALERT_COOLDOWN_MS
  ) {
    await raiseDeliveryAlert({
      severity: "CRITICAL",
      impact: "HIGH",
      category: "EXTERNAL_API",
      reason: "CONSECUTIVE_FAILURES",
      consecutiveFailures: delivery.consecutiveFailures,
      responseCode: delivery.lastResponseCode,
      errorCode: e?.code ?? null,
      lastKind: kind,
    });
  }
  throw lastErr ?? new Error("No email sender available");
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

/** 20 -> "20 minutes", 60 -> "1 hour", 1440 -> "24 hours", 4320 -> "3 days". */
export function formatExpiry(minutes: number): string {
  const m = Math.max(1, Math.round(Number(minutes) || 0));
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (m < 60) return plural(m, "minute");
  if (m <= 48 * 60 || m % 1440 !== 0) return plural(Math.round(m / 60), "hour");
  return plural(m / 1440, "day");
}

type EmailContent = {
  title: string;
  /** Inbox preview line (hidden in the body). */
  preheader: string;
  name: string;
  lines: string[];
  action?: { label: string; url: string };
  code?: string;
  expiry: string;
  footnote: string;
};

/**
 * One layout for every transactional email (English only). Everything user-controlled is escaped;
 * the action URL is also printed as text so it still works where buttons are stripped.
 */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const e = escapeHtml;
  const greeting = `Hi ${c.name || "Miner"},`;
  const button = c.action
    ? `<tr><td style="padding:8px 0 20px 0;"><a href="${e(c.action.url)}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700;font-size:15px;">${e(c.action.label)}</a></td></tr>
          <tr><td style="padding:0 0 18px 0;color:#94a3b8;font-size:12px;line-height:18px;">If the button does not work, copy this link into your browser:<br><a href="${e(c.action.url)}" style="color:#60a5fa;word-break:break-all;">${e(c.action.url)}</a></td></tr>`
    : "";
  const code = c.code
    ? `<tr><td style="padding:4px 0 20px 0;"><div style="display:inline-block;background:#020617;border:1px solid #334155;border-radius:10px;padding:12px 20px;font-family:'Courier New',monospace;font-size:30px;letter-spacing:6px;font-weight:700;color:#f8fafc;">${e(c.code)}</div></td></tr>`
    : "";
  const body = c.lines.map((l) => `<tr><td style="padding:0 0 14px 0;color:#cbd5e1;font-size:15px;line-height:22px;">${e(l)}</td></tr>`).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${e(c.title)}</title></head>
<body style="margin:0;padding:0;background:#020617;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${e(c.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 0 16px 4px;font-size:20px;font-weight:800;color:#f8fafc;letter-spacing:0.5px;">Block<span style="color:#3b82f6;">Miner</span></td></tr>
        <tr><td style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:28px 28px 20px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 0 16px 0;font-size:22px;font-weight:700;color:#f8fafc;">${e(c.title)}</td></tr>
            <tr><td style="padding:0 0 14px 0;color:#cbd5e1;font-size:15px;">${e(greeting)}</td></tr>
            ${body}
            ${code}
            ${button}
            <tr><td style="padding:0 0 8px 0;color:#94a3b8;font-size:13px;">This ${c.code ? "code" : "link"} expires in ${e(c.expiry)}.</td></tr>
            <tr><td style="padding:12px 0 0 0;border-top:1px solid #1e293b;color:#64748b;font-size:12px;line-height:18px;">${e(c.footnote)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 4px 0 4px;color:#475569;font-size:11px;line-height:16px;">This is an automated message from BlockMiner (blockminer.space). Please do not reply to this email. BlockMiner will never ask for your password.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = [
    c.title,
    "",
    greeting,
    "",
    ...c.lines,
    ...(c.code ? ["", c.code] : []),
    ...(c.action ? ["", `${c.action.label}: ${c.action.url}`] : []),
    "",
    `This ${c.code ? "code" : "link"} expires in ${c.expiry}.`,
    c.footnote,
    "",
    "-- BlockMiner (blockminer.space). This is an automated message; please do not reply.",
  ].join("\n");
  return { html, text };
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
  const subject = "Reset your BlockMiner password";
  const { html, text } = renderEmail({
    title: subject,
    preheader: "Use this link to choose a new password.",
    name: input.name,
    lines: ["We received a request to reset the password for your BlockMiner account. Click the button below to choose a new one. The link can only be used once."],
    action: { label: "Reset password", url: input.resetUrl },
    expiry: formatExpiry(input.ttlMinutes || 20),
    footnote: "If you did not request a password reset, you can safely ignore this email. Your password will not change.",
  });
  await deliver(tx, { to: input.to, subject, text, html }, "Password reset");
}

/** item 95 Parte B: mesmo padrão de sendPasswordResetEmail — best-effort, no-op sem SMTP. */
export async function sendEmailVerificationEmail(input: {
  to: string;
  name: string;
  verifyUrl: string;
  ttlMinutes?: number;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    log.warn("sendEmailVerificationEmail called without SMTP configured — no-op", { to: maskEmail(input.to) });
    return;
  }
  const subject = "Confirm your BlockMiner email";
  const { html, text } = renderEmail({
    title: subject,
    preheader: "Confirm your email to unlock withdrawals and chat.",
    name: input.name,
    lines: ["Welcome to BlockMiner! Please confirm your email address to unlock withdrawals and the chat."],
    action: { label: "Confirm email", url: input.verifyUrl },
    expiry: formatExpiry(input.ttlMinutes || 1440),
    footnote: "If you did not create a BlockMiner account, you can safely ignore this email.",
  });
  await deliver(tx, { to: input.to, subject, text, html }, "Email verification");
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
  const subject = "Your BlockMiner login code";
  const { html, text } = renderEmail({
    title: subject,
    preheader: "Enter this code to finish signing in.",
    name: input.name,
    lines: ["Enter the code below to finish signing in to BlockMiner. Never share this code with anyone."],
    code: String(input.code || "").trim(),
    expiry: formatExpiry(input.ttlMinutes || 10),
    footnote: "If this was not you, ignore this email and change your password right away.",
  });
  await deliver(tx, { to: input.to, subject, text, html }, "Login 2FA");
}
