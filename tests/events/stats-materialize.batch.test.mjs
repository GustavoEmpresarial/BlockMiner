/**
 * Integration: batched earnings materialization against the local/dev Postgres.
 * Uses a dedicated user id range and event-id prefix, cleaned before and after.
 */
import test from "node:test";
import assert from "node:assert/strict";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("stats-materialize.batch.test requires a local DATABASE_URL");
}

const { applyEarningsEventsBatch, applyEarningsEvent } = await import(
  "../../server/modules/events/events.stats-materialize.ts"
);
const { buildEarningsPolCreditedEvent } = await import("../../server/modules/events/events.envelope.ts");
const { default: prisma } = await import("../../server/core/database/prisma.ts");

const U1 = 990_000_001;
const U2 = 990_000_002;
const PREFIX = `t-batch-${process.pid}-`;
const DAY = new Date("2026-10-16T12:00:00.000Z");

async function cleanup() {
  await prisma.userStatsEarningsDaily.deleteMany({ where: { userId: { in: [U1, U2] } } });
  await prisma.userStatsEarningsTotal.deleteMany({ where: { userId: { in: [U1, U2] } } });
  await prisma.statsEventDedupe.deleteMany({ where: { eventId: { startsWith: PREFIX } } });
}

function ev(n, userId, amountPol, extra = {}) {
  return buildEarningsPolCreditedEvent({
    userId,
    source: "mining",
    amountPol,
    occurredAt: DAY,
    eventId: `${PREFIX}${n}`,
    ...extra,
  });
}

async function totalOf(userId) {
  const row = await prisma.userStatsEarningsTotal.findUnique({
    where: { userId_source: { userId, source: "mining" } },
  });
  return row ? row.amountPol.toFixed() : null;
}

test.before(cleanup);
test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("batch sums per user/day/source and skips invalid events", async () => {
  const invalid = { eventId: "x" };
  const ignored = { ...ev(90, U1, 1), type: "earnings.other" };
  const zero = ev(91, U1, 0);
  const res = await applyEarningsEventsBatch([ev(1, U1, 0.1), ev(2, U1, 0.2), ev(3, U2, 5), invalid, ignored, zero, ev(1, U1, 0.1)]);

  assert.equal(res.applied, 3);
  assert.deepEqual(res.skipped, { invalid_envelope: 1, ignored_type: 1, non_positive_amount: 1, duplicate: 1 });
  // Decimal math, not float: 0.1 + 0.2 must be exactly 0.3.
  assert.equal(await totalOf(U1), "0.3");
  assert.equal(await totalOf(U2), "5");
  const daily = await prisma.userStatsEarningsDaily.findMany({ where: { userId: U1 } });
  assert.equal(daily.length, 1);
  assert.equal(daily[0].amountPol.toFixed(), "0.3");
});

test("replaying the same batch credits nothing (idempotent)", async () => {
  const res = await applyEarningsEventsBatch([ev(1, U1, 0.1), ev(2, U1, 0.2), ev(3, U2, 5)]);
  assert.equal(res.applied, 0);
  assert.equal(res.skipped.duplicate, 3);
  assert.equal(await totalOf(U1), "0.3");
});

test("concurrent batches with the same events credit once", async () => {
  const batch = [ev(10, U2, 1.5), ev(11, U2, 2.5)];
  const [a, b] = await Promise.all([applyEarningsEventsBatch(batch), applyEarningsEventsBatch(batch)]);
  assert.equal(a.applied + b.applied, 2);
  assert.equal(await totalOf(U2), "9");
});

test("single-event wrapper keeps the old contract", async () => {
  assert.deepEqual(await applyEarningsEvent(ev(20, U1, 1)), { applied: true });
  assert.deepEqual(await applyEarningsEvent(ev(20, U1, 1)), { applied: false, reason: "duplicate" });
  assert.deepEqual(await applyEarningsEvent({}), { applied: false, reason: "invalid_envelope" });
  assert.equal(await totalOf(U1), "1.3");
});

test("empty and all-invalid batches touch nothing", async () => {
  assert.deepEqual((await applyEarningsEventsBatch([])).applied, 0);
  assert.deepEqual((await applyEarningsEventsBatch([null, 42, "x"])).skipped.invalid_envelope, 3);
});
