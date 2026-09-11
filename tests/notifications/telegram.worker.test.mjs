import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env) — covers the real Telegram
// Bot API outbox worker (telegram.worker.ts / server/cron/telegram-outbox.cron.ts).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const worker = await import("../../server/modules/notifications/telegram.worker.ts");
const { TELEGRAM_EVENT_TYPES } = await import("../../server/modules/notifications/telegram.types.ts");

const cleanupIds = [];

test.after(async () => {
  if (cleanupIds.length) {
    await prisma.telegramOutboxEvent.deleteMany({ where: { id: { in: cleanupIds } } });
  }
  await prisma.$disconnect();
});

async function createEvent(overrides = {}) {
  const event = await prisma.telegramOutboxEvent.create({
    data: {
      type: TELEGRAM_EVENT_TYPES.SUPPORT_TICKET_NEW,
      status: "pending",
      attempts: 0,
      currency: "POL",
      usernameSnapshot: "tester",
      payload: { subject: "worker test" },
      nextRunAt: new Date(0),
      ...overrides,
    },
  });
  cleanupIds.push(event.id);
  return event;
}

test("processTelegramEvent: throws honestly when TELEGRAM_BOT_TOKEN is not configured (never fakes success)", async () => {
  const event = await createEvent();
  const config = worker.getWorkerConfig();
  assert.equal(config.botTokenConfigured, false, "dev env has no real TELEGRAM_BOT_TOKEN configured");
  // Honest failure regardless of exact cause (missing token OR missing chat id, depending on
  // what's configured in this dev env) — the point is it throws for real, it never fakes a 200.
  await assert.rejects(
    () => worker.processTelegramEvent(event, config),
    /nao configurado/,
  );
});

test("runTelegramOutboxTick: claims a pending event and marks it failed honestly (no token) — never 'sent'", async () => {
  const event = await createEvent();
  // batchSize large enough to drain any leftover pending/failed rows from earlier tests in this
  // file too (claimNextEvent always takes the oldest eligible row first) — this test only makes
  // assertions about the specific row it created, not about aggregate counts.
  await worker.runTelegramOutboxTick({
    config: { ...worker.getWorkerConfig(), batchSize: 50 },
  });

  const row = await prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
  assert.equal(row.status, "failed");
  assert.equal(row.attempts, 1);
  assert.ok(row.lastError, "lastError must be recorded from the real (honest) failure");
  assert.equal(row.sentAt, null, "must never set sentAt without a genuine 200 from Telegram");
});

test("runTelegramOutboxTick: marks sent ONLY after a real (mocked-200) fetchImpl resolves", async () => {
  const event = await createEvent({ type: TELEGRAM_EVENT_TYPES.VIDEO_SUBMISSION_NEW });
  let calls = 0;
  const fetchImpl = async (method, botToken, _body) => {
    calls += 1;
    assert.equal(method, "sendMessage");
    assert.equal(botToken, "fake-token-for-test");
    return { ok: true, result: { message_id: 1 } };
  };
  await worker.runTelegramOutboxTick({
    config: {
      ...worker.getWorkerConfig(),
      botToken: "fake-token-for-test",
      botTokenConfigured: true,
      privateChatId: "123456789",
      batchSize: 50,
    },
    fetchImpl,
  });
  assert.ok(calls >= 1, "the fetch implementation must actually be invoked to send the message");

  const row = await prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
  assert.equal(row.status, "sent");
  assert.ok(row.sentAt, "sentAt must be set once the (mocked) real send succeeds");
});

test("runTelegramOutboxTick: retries with backoff, then goes 'dead' once maxAttempts is reached (honest failure path)", async () => {
  const event = await createEvent({ status: "failed", attempts: 1 });
  const lowMaxAttemptsConfig = { ...worker.getWorkerConfig(), maxAttempts: 2, batchSize: 50 };

  // Tick 1: attempts becomes 2 (== maxAttempts) -> dead, since no real token/fetch succeeds.
  const result = await worker.runTelegramOutboxTick({ config: lowMaxAttemptsConfig });
  assert.ok(result.processed >= 1);

  const row = await prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
  assert.equal(row.attempts, 2);
  assert.equal(row.status, "dead", "must be dead-lettered once attempts reach maxAttempts, never faked as sent");
  assert.equal(row.sentAt, null);
});

test("runTelegramOutboxTick: idempotent — never touches an already-'sent' event", async () => {
  const sentAt = new Date();
  const event = await createEvent({ status: "sent", attempts: 1, sentAt, nextRunAt: new Date(0) });

  const result = await worker.runTelegramOutboxTick({
    config: { ...worker.getWorkerConfig(), batchSize: 5 },
  });
  // The tick may claim OTHER pending/failed rows created by earlier tests running concurrently in
  // the same file, but it must never re-claim this already-sent row.
  assert.ok(result.processed >= 0);

  const row = await prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
  assert.equal(row.status, "sent");
  assert.equal(row.attempts, 1, "attempts must not be incremented for an already-sent event");
  assert.equal(row.sentAt.getTime(), sentAt.getTime());
});

test("isTelegramOutboxWorkerRunning: reflects runtime flag toggled by the cron's start/stop", async () => {
  const before = worker.isTelegramOutboxWorkerRunning();
  worker.setTelegramOutboxWorkerRunning(true);
  assert.equal(worker.isTelegramOutboxWorkerRunning(), true);
  worker.setTelegramOutboxWorkerRunning(false);
  assert.equal(worker.isTelegramOutboxWorkerRunning(), false);
  worker.setTelegramOutboxWorkerRunning(before);
});
