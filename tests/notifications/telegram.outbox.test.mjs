import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const telegram = await import("../../server/modules/notifications/telegram.service.ts");
const { TELEGRAM_EVENT_TYPES } = await import("../../server/modules/notifications/telegram.types.ts");

const cleanupIds = [];

test.after(async () => {
  if (cleanupIds.length) {
    await prisma.telegramOutboxEvent.deleteMany({ where: { id: { in: cleanupIds } } });
  }
  await prisma.$disconnect();
});

test("createGenericTelegramOutboxEvent: persists a real row (support ticket style event)", async () => {
  const event = await telegram.createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.SUPPORT_TICKET_NEW,
    { ticketId: 999999, subject: "test subject" },
    { userId: null, usernameSnapshot: "tester" },
  );
  cleanupIds.push(event.id);

  const row = await prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
  assert.ok(row, "row must exist in telegram_outbox_events");
  assert.equal(row.type, TELEGRAM_EVENT_TYPES.SUPPORT_TICKET_NEW);
  assert.equal(row.status, "pending");
  assert.equal(row.transactionId, null);
  assert.deepEqual(row.payload.ticketId, 999999);
});

test("listTelegramOutboxEvents: includes a freshly created event, paginated", async () => {
  const event = await telegram.createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.VIDEO_SUBMISSION_NEW,
    { submissionId: 12345 },
    { userId: null },
  );
  cleanupIds.push(event.id);

  const { events, total } = await telegram.listTelegramOutboxEvents({ page: 1, limit: 100 });
  assert.ok(total >= 1);
  assert.ok(events.some((e) => e.id === event.id), "listed events must include the new one");
});

test("retryTelegramOutboxEvent: rejects pending events (only failed/dead may retry)", async () => {
  const event = await telegram.createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.PUBLIC_GUEST_MESSAGE_NEW,
    { id: 1 },
    {},
  );
  cleanupIds.push(event.id);

  await assert.rejects(() => telegram.retryTelegramOutboxEvent(event.id), /failed\/dead/);
});

test("retryTelegramOutboxEvent: resets status/attempts for a failed event (no real send happens)", async () => {
  const event = await prisma.telegramOutboxEvent.create({
    data: {
      type: TELEGRAM_EVENT_TYPES.HOT_WALLET_LOW_BALANCE_ALERT,
      status: "failed",
      attempts: 3,
      lastError: "some previous failure",
      transactionId: null,
      currency: "POL",
      payload: {},
      nextRunAt: new Date(0),
    },
  });
  cleanupIds.push(event.id);

  const retried = await telegram.retryTelegramOutboxEvent(event.id);
  assert.equal(retried.status, "pending");
  assert.equal(retried.attempts, 0);

  const row = await prisma.telegramOutboxEvent.findUnique({ where: { id: event.id } });
  assert.equal(row.lastError, null);
  assert.equal(row.sentAt, null);
});

test("retryTelegramOutboxEvent: unknown id throws 404-shaped error", async () => {
  await assert.rejects(
    () => telegram.retryTelegramOutboxEvent(987654321),
    (err) => err.statusCode === 404,
  );
});

test("createTelegramTestEvent: withdrawal_requested_private_alert requires alerts enabled via env", async () => {
  const prevEnabled = process.env.TELEGRAM_WITHDRAWAL_ALERTS_ENABLED;
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  try {
    delete process.env.TELEGRAM_WITHDRAWAL_ALERTS_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    await assert.rejects(
      () => telegram.createTelegramTestEvent(TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT, {}),
      (err) => err.statusCode === 400,
    );
  } finally {
    if (prevEnabled === undefined) delete process.env.TELEGRAM_WITHDRAWAL_ALERTS_ENABLED;
    else process.env.TELEGRAM_WITHDRAWAL_ALERTS_ENABLED = prevEnabled;
    if (prevToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = prevToken;
  }
});

test("updateWithdrawalTelegramSettings: always rejects (env-only config, no worker to apply DB settings)", async () => {
  await assert.rejects(
    () => telegram.updateWithdrawalTelegramSettings(),
    (err) => err.statusCode === 400,
  );
});

test("getWithdrawalTelegramSettings: reports workerPorted:true (real outbox worker exists as of Fase 10c)", async () => {
  const settings = await telegram.getWithdrawalTelegramSettings();
  assert.equal(settings.workerPorted, true);
  assert.equal(settings.configSource, "env");
});

test("getTelegramWorkerHealth: reports botTokenConfigured distinctly from workerRunning, real queue counts", async () => {
  const health = await telegram.getTelegramWorkerHealth();
  assert.equal(typeof health.workerRunning, "boolean");
  assert.equal(typeof health.botTokenConfigured, "boolean");
  assert.ok(typeof health.queue.pending === "number");
});
