/**
 * The only provider (a Hostinger mailbox) got its outbound disabled twice in a day, taking
 * verification / password reset / 2FA mail down with it. With SMTP_FALLBACK_* set, a message the
 * primary cannot take goes out through the fallback in the same call, and a disabled primary is
 * skipped (no traffic) until its pause expires.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.NODE_ENV = "development";
process.env.LOG_LEVEL = "info";
Object.assign(process.env, {
  SMTP_HOST: "primary.example.invalid", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "u1", SMTP_PASS: "p1",
  SMTP_FROM: "no-reply@primary.example.invalid",
  SMTP_FALLBACK_HOST: "fallback.example.invalid", SMTP_FALLBACK_PORT: "587", SMTP_FALLBACK_SECURE: "false",
  SMTP_FALLBACK_USER: "u2", SMTP_FALLBACK_PASS: "p2", SMTP_FALLBACK_FROM: "no-reply@mail.example.invalid",
});

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const calls = []; // { host, from }
const behavior = { primary: "ok", fallback: "ok" }; // ok | 554 | timeout
function failFor(kind) {
  if (kind === "554") return Object.assign(new Error("554 5.7.1 Outbound sending is disabled for this account"), { responseCode: 554, code: "EMESSAGE" });
  return Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
}
mock.module("nodemailer", {
  defaultExport: {
    createTransport: (opts) => ({
      sendMail: async (mail) => {
        const who = opts.host.startsWith("primary") ? "primary" : "fallback";
        calls.push({ who, from: mail.from });
        if (behavior[who] !== "ok") throw failFor(behavior[who]);
        return { accepted: [mail.to] };
      },
    }),
  },
});
mock.module(pathToFileURL(path.join(root, "server/modules/notifications/telegram.service.ts")).href, {
  namedExports: { createGenericTelegramOutboxEvent: async () => ({ id: 1 }) },
});
mock.module(pathToFileURL(path.join(root, "server/core/redis/index.ts")).href, {
  namedExports: { withRedis: async (_fn, fallback) => (typeof fallback === "function" ? fallback() : fallback) },
});
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, {
  defaultExport: { $transaction: async () => { throw new Error("no db in test"); } },
});

const mailer = await import("../../server/shared/security/mailer.ts");
let n = 0;
const send = () => mailer.sendEmailVerificationEmail({ to: `p${(n += 1)}@x.co`, name: "P", verifyUrl: "https://x/v" });

test("primary disabled (554): the same email goes out via the fallback, with the fallback's From", async () => {
  mailer.__resetEmailDeliveryForTests();
  calls.length = 0;
  behavior.primary = "554";
  await send();
  assert.deepEqual(calls.map((c) => c.who), ["primary", "fallback"]);
  assert.equal(calls[1].from, "no-reply@mail.example.invalid");
});

test("while the primary is paused it gets no traffic; after the pause one probe goes to it", async () => {
  calls.length = 0;
  await send();
  assert.deepEqual(calls.map((c) => c.who), ["fallback"]);
  behavior.primary = "ok";
  mailer.__advanceEmailPauseForTests(31 * 60_000);
  calls.length = 0;
  await send();
  assert.deepEqual(calls.map((c) => c.who), ["primary"]);
});

test("transient primary failure also falls through to the fallback", async () => {
  mailer.__resetEmailDeliveryForTests();
  calls.length = 0;
  behavior.primary = "timeout";
  await send();
  assert.deepEqual(calls.map((c) => c.who), ["primary", "fallback"]);
  behavior.primary = "ok";
});

test("both providers down: the caller gets the error and health shows both", async () => {
  mailer.__resetEmailDeliveryForTests();
  behavior.primary = "554";
  behavior.fallback = "554";
  await assert.rejects(send(), /554/);
  const h = mailer.getEmailDeliveryHealth();
  assert.equal(h.senders.length, 2);
  assert.ok(h.senders.every((s) => s.paused));
  await assert.rejects(send(), (e) => e.code === "EMAIL_SENDING_PAUSED");
  behavior.primary = "ok";
  behavior.fallback = "ok";
});
