/**
 * Transactional emails are English-only, share one layout, and state the real expiry
 * (a 24h reset link was announced as "24 minutes").
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

Object.assign(process.env, { NODE_ENV: "development", SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "BlockMiner <no-reply@example.invalid>" });
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const sent = [];
mock.module("nodemailer", { defaultExport: { createTransport: () => ({ sendMail: async (m) => { sent.push(m); return { accepted: [m.to] }; } }) } });
mock.module(pathToFileURL(path.join(root, "server/modules/notifications/telegram.service.ts")).href, { namedExports: { createGenericTelegramOutboxEvent: async () => ({ id: 1 }) } });
mock.module(pathToFileURL(path.join(root, "server/core/redis/index.ts")).href, { namedExports: { withRedis: async (_f, fb) => (typeof fb === "function" ? fb() : fb) } });
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, { defaultExport: { $transaction: async () => { throw new Error("no db"); } } });
const mailer = await import("../../server/shared/security/mailer.ts");

const PORTUGUESE = /Olá|senha|Redefini|Confirme|código|expira|ignore este|Se você/i;

test("formatExpiry", () => {
  assert.equal(mailer.formatExpiry(1), "1 minute");
  assert.equal(mailer.formatExpiry(20), "20 minutes");
  assert.equal(mailer.formatExpiry(60), "1 hour");
  assert.equal(mailer.formatExpiry(1440), "24 hours");
  assert.equal(mailer.formatExpiry(4320), "3 days");
  assert.equal(mailer.formatExpiry(0), "1 minute");
});

test("password reset: English, real expiry, link in button and as text", async () => {
  sent.length = 0;
  await mailer.sendPasswordResetEmail({ to: "a@b.co", name: "Gugu", resetUrl: "https://blockminer.space/forgot-password?token=T&x=1", ttlMinutes: 1440 });
  const m = sent[0];
  assert.equal(m.subject, "Reset your BlockMiner password");
  for (const body of [m.html, m.text]) {
    assert.ok(!PORTUGUESE.test(body), body);
    assert.ok(body.includes("24 hours"));
    assert.ok(!body.includes("24 minutes"));
    assert.ok(body.includes("Hi Gugu,"));
  }
  assert.ok(m.html.includes('href="https://blockminer.space/forgot-password?token=T&amp;x=1"'));
  assert.ok(m.text.includes("https://blockminer.space/forgot-password?token=T&x=1"));
});

test("verification and 2FA emails are English too", async () => {
  sent.length = 0;
  await mailer.sendEmailVerificationEmail({ to: "v@b.co", name: "", verifyUrl: "https://x/v" });
  await mailer.sendLoginTwoFactorCodeEmail({ to: "c@b.co", name: "C", code: " 123456 ", ttlMinutes: 10 });
  const [v, c] = sent;
  assert.equal(v.subject, "Confirm your BlockMiner email");
  assert.ok(v.text.includes("Hi Miner,") && v.text.includes("24 hours"));
  assert.equal(c.subject, "Your BlockMiner login code");
  assert.ok(c.html.includes(">123456<") && c.text.includes("This code expires in 10 minutes."));
  for (const m of sent) assert.ok(!PORTUGUESE.test(m.html + m.text), m.subject);
});

test("an attribute-breaking URL is escaped in href", async () => {
  sent.length = 0;
  await mailer.sendPasswordResetEmail({ to: "a@b.co", name: "x", resetUrl: 'https://x/"><script>alert(1)</script>', ttlMinutes: 20 });
  assert.ok(!sent[0].html.includes("<script>"));
});
