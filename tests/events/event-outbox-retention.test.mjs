/** Integration: event_outbox retention only drops published rows older than the window. */
import test from "node:test";
import assert from "node:assert/strict";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("event-outbox-retention.test requires a local DATABASE_URL");
}
const { pruneOldPublishedOutbox } = await import("../../server/cron/event-outbox-retention.cron.ts");
const { default: prisma } = await import("../../server/core/database/prisma.ts");

const PREFIX = `t-oretention-${process.pid}-`;
const day = 24 * 60 * 60 * 1000;
const now = Date.now();
// Older than any real dev row, so ours are the first the oldest-first sweep reaches.
const ANCIENT = new Date("2000-01-01T00:00:00Z");
const cleanup = () => prisma.eventOutbox.deleteMany({ where: { eventId: { startsWith: PREFIX } } });
const mine = async () =>
  new Set((await prisma.eventOutbox.findMany({ where: { eventId: { startsWith: PREFIX } }, select: { eventId: true } })).map((r) => r.eventId.slice(PREFIX.length)));

test.before(cleanup);
test.after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("drops old published rows in bounded batches and never touches unpublished or recent rows", async () => {
  const rows = [];
  for (let i = 0; i < 25; i++) rows.push({ eventId: `${PREFIX}old-pub-${i}`, topic: "t", payloadJson: {}, createdAt: ANCIENT, publishedAt: ANCIENT });
  rows.push({ eventId: `${PREFIX}old-unpub`, topic: "t", payloadJson: {}, createdAt: new Date(now - 30 * day), publishedAt: null });
  rows.push({ eventId: `${PREFIX}recent-pub`, topic: "t", payloadJson: {}, createdAt: new Date(now - 1 * day), publishedAt: new Date(now - 1 * day) });
  await prisma.eventOutbox.createMany({ data: rows });

  // Cap: 2 batches of 10 per tick → exactly 20 of our 25 ancient rows, oldest first.
  const first = await pruneOldPublishedOutbox(7, 10, 2, 0);
  assert.equal(first, 20, "a tick deletes at most batch*maxBatches");
  assert.equal([...(await mine())].filter((k) => k.startsWith("old-pub")).length, 5);

  // Next tick takes the remaining 5 of ours first (and may go on to older dev rows).
  await pruneOldPublishedOutbox(7, 5, 1, 0);
  const left = await mine();
  assert.deepEqual([...left].sort(), ["old-unpub", "recent-pub"], "only unpublished and recent rows remain");
});
