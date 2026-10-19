/**
 * The SMTP provider disabled outbound sending for hours (554 5.7.1) and nobody knew: each failure
 * was one log line among thousands. Now consecutive failures raise one CRITICAL alert (stable code,
 * cooldown) plus a Telegram outbox event, recovery is logged, and addresses never hit the logs whole.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.NODE_ENV = "development";
process.env.LOG_LEVEL = "info";
process.env.SMTP_HOST = "smtp.example.invalid";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "u";
process.env.SMTP_PASS = "p";
process.env.SMTP_FROM = "BlockMiner <no-reply@example.invalid>";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
let failNext = 0;
let failKind = "timeout";
let sent = 0;
let lastMail = null;
let smtpAttempts = 0;
mock.module("nodemailer", {
  defaultExport: {
    createTransport: () => ({
      sendMail: async (mail) => {
        smtpAttempts += 1;
        lastMail = mail;
        if (failNext > 0) {
          failNext -= 1;
          if (failKind === "554") throw Object.assign(new Error("Message failed: 554 5.7.1 Outbound sending is disabled for this account"), { responseCode: 554, code: "EMESSAGE" });
          throw Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
        }
        sent += 1;
        return { accepted: ["x"] };
      },
    }),
  },
});
const outbox = [];
mock.module(pathToFileURL(path.join(root, "server/modules/notifications/telegram.service.ts")).href, {
  namedExports: {
    createGenericTelegramOutboxEvent: async (type, payload) => {
      outbox.push({ type, payload });
      return { id: outbox.length };
    },
  },
});

mock.module(pathToFileURL(path.join(root, "server/core/redis/index.ts")).href, {
  namedExports: { withRedis: async (_fn, fallback) => (typeof fallback === "function" ? fallback() : fallback) },
});
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, {
  defaultExport: { $transaction: async () => { throw new Error("no db in test"); } },
});

const mailer = await import("../../server/shared/security/mailer.ts");

async function capture(fn) {
  const lines = [];
  const orig = console.info;
  console.info = (l) => lines.push(JSON.parse(l));
  try {
    await fn();
  } finally {
    console.info = orig;
  }
  return lines;
}

const send = () => mailer.sendEmailVerificationEmail({ to: "jogador.teste@gmail.com", name: "J", verifyUrl: "https://x/verify?t=SECRET", ttlHours: 24 });

test("addresses are masked in logs, the verification token never appears", async () => {
  mailer.__resetEmailDeliveryForTests();
  const lines = await capture(send);
  const text = JSON.stringify(lines);
  assert.ok(!text.includes("jogador.teste@gmail.com"), text);
  assert.ok(text.includes("j***@gmail.com"), text);
  assert.ok(!text.includes("SECRET"));
});

test("3 consecutive (transient) failures raise one CRITICAL EMAIL_DELIVERY_FAILING + one Telegram event; then cooldown", async () => {
  mailer.__resetEmailDeliveryForTests();
  outbox.length = 0;
  failKind = "timeout";
  failNext = 6;
  const lines = await capture(async () => {
    for (let i = 0; i < 6; i += 1) await send().catch(() => {});
  });
  const alerts = lines.filter((l) => l.message === "EMAIL_DELIVERY_FAILING");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, "error");
  assert.equal(alerts[0].details.severity, "CRITICAL");
  assert.equal(alerts[0].details.consecutiveFailures, 3);
  assert.equal(alerts[0].details.errorCode, "ETIMEDOUT");
  assert.ok(!JSON.stringify(alerts).includes("jogador.teste"));
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].type, "email_delivery_failing");
});

test("send failures still throw to the caller (flows keep their own error handling)", async () => {
  mailer.__resetEmailDeliveryForTests();
  failKind = "554";
  failNext = 1;
  await assert.rejects(send(), /554/);
  failKind = "timeout";
});

test("a success after failures logs EMAIL_DELIVERY_RECOVERED once and resets the streak", async () => {
  mailer.__resetEmailDeliveryForTests();
  failNext = 3;
  const lines = await capture(async () => {
    for (let i = 0; i < 3; i += 1) await send().catch(() => {});
    await send();
    await send();
  });
  assert.equal(lines.filter((l) => l.message === "EMAIL_DELIVERY_RECOVERED").length, 1);
  assert.equal(mailer.getEmailDeliveryHealth().consecutiveFailures, 0);
});

test("maskEmail", () => {
  assert.equal(mailer.maskEmail("ab@x.com"), "a***@x.com");
  assert.equal(mailer.maskEmail("not-an-email"), "***");
  assert.equal(mailer.maskEmail(""), "***");
});

test("a user-chosen name cannot inject HTML into the email body", async () => {
  mailer.__resetEmailDeliveryForTests();
  failNext = 0;
  await mailer.sendEmailVerificationEmail({ to: "a@b.co", name: "<img src=x onerror=alert(1)>", verifyUrl: "https://x/v" });
  assert.ok(lastMail, "mail reached the transport");
  assert.ok(!lastMail.html.includes("<img src=x"), lastMail.html);
  assert.ok(lastMail.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("account disabled (554): breaker pauses all sends without touching SMTP, then probes once after the cooldown", async () => {
  mailer.__resetEmailDeliveryForTests();
  outbox.length = 0;
  const before = sent;
  failKind = "554";
  failNext = 1; // provider answers 554 once
  const lines = await capture(() => assert.rejects(send(), /554/));
  failKind = "timeout";
  failNext = 0;
  const alert = lines.find((l) => l.message === "EMAIL_DELIVERY_FAILING");
  assert.ok(alert, "account disabled alerts immediately");
  assert.equal(alert.details.reason, "ACCOUNT_DISABLED");
  assert.equal(outbox.length, 1);
  const attemptsBefore = smtpAttempts;
  await assert.rejects(send(), (e) => e.code === "EMAIL_SENDING_PAUSED");
  await assert.rejects(send(), (e) => e.code === "EMAIL_SENDING_PAUSED");
  assert.equal(smtpAttempts, attemptsBefore, "no SMTP traffic while paused");
  assert.equal(mailer.getEmailDeliveryHealth().paused, true);
  mailer.__advanceEmailPauseForTests(31 * 60_000);
  await send(); // probe succeeds -> closed again
  assert.equal(sent, before + 1);
  assert.equal(mailer.getEmailDeliveryHealth().paused, false);
});

test("EMAIL_SENDING_DISABLED=1 is a kill switch: nothing reaches SMTP", async () => {
  mailer.__resetEmailDeliveryForTests();
  process.env.EMAIL_SENDING_DISABLED = "1";
  try {
    const a = smtpAttempts;
    await assert.rejects(send(), (e) => e.code === "EMAIL_SENDING_DISABLED");
    assert.equal(smtpAttempts, a);
  } finally {
    delete process.env.EMAIL_SENDING_DISABLED;
  }
});

test("per-recipient cap: the same address cannot be mail-bombed (and that is not a delivery failure)", async () => {
  mailer.__resetEmailDeliveryForTests();
  failNext = 0;
  const to = "vitima@example.com";
  const one = () => mailer.sendPasswordResetEmail({ to, name: "V", resetUrl: "https://x/r", ttlMinutes: 20 });
  for (let i = 0; i < mailer.EMAIL_PER_RECIPIENT_MAX_PER_HOUR; i += 1) await one();
  const a = smtpAttempts;
  await assert.rejects(one(), (e) => e.code === "EMAIL_RECIPIENT_RATE_LIMITED");
  assert.equal(smtpAttempts, a);
  assert.equal(mailer.getEmailDeliveryHealth().consecutiveFailures, 0);
  // another recipient is unaffected
  await mailer.sendPasswordResetEmail({ to: "outra@example.com", name: "O", resetUrl: "https://x/r", ttlMinutes: 20 });
});
