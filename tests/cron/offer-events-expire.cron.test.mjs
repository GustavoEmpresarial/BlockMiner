import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { deactivateExpiredOfferEvents } = await import("../../server/modules/offer-events/index.ts");

const createdIds = [];

async function makeEvent(endsAtOffsetMs, opts = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const ev = await prisma.offerEvent.create({
    data: {
      title: `Cron Test Event ${suffix}`,
      description: "test",
      startsAt: new Date(Date.now() - 3600_000),
      endsAt: new Date(Date.now() + endsAtOffsetMs),
      isActive: true,
      ...opts,
    },
  });
  createdIds.push(ev.id);
  return ev;
}

test.after(async () => {
  await prisma.offerEvent.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

test("deactivateExpiredOfferEvents: deactivates expired active events, preserves live ones and already-deleted rows", async () => {
  const expired = await makeEvent(-3600_000); // endsAt in the past
  const live = await makeEvent(3600_000); // endsAt in the future
  const alreadySoftDeleted = await makeEvent(-3600_000, { deletedAt: new Date() });

  const count = await deactivateExpiredOfferEvents();
  assert.ok(count >= 1);

  const [expiredRow, liveRow, deletedRow] = await Promise.all([
    prisma.offerEvent.findUnique({ where: { id: expired.id } }),
    prisma.offerEvent.findUnique({ where: { id: live.id } }),
    prisma.offerEvent.findUnique({ where: { id: alreadySoftDeleted.id } }),
  ]);

  assert.equal(expiredRow.isActive, false, "expired event must be deactivated");
  assert.equal(liveRow.isActive, true, "live event must stay active");
  assert.equal(deletedRow.isActive, true, "soft-deleted rows are excluded from the sweep (deletedAt: null filter)");
});

test("deactivateExpiredOfferEvents: is idempotent — second run touches nothing new", async () => {
  const expired = await makeEvent(-3600_000);
  await deactivateExpiredOfferEvents();
  const second = await deactivateExpiredOfferEvents();
  // second run may still count other pre-existing expired rows in the DB, but our seeded row
  // must already be inactive and not cause any error.
  assert.equal(typeof second, "number");
  const row = await prisma.offerEvent.findUnique({ where: { id: expired.id } });
  assert.equal(row.isActive, false);
});
