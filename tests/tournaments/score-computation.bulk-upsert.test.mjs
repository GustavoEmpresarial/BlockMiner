/**
 * Integration: batchUpsertEntries single-statement upsert against the local/dev Postgres.
 * Creates a throwaway tournament (entries cascade on delete) over existing local users.
 */
import test from "node:test";
import assert from "node:assert/strict";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("score-computation.bulk-upsert.test requires a local DATABASE_URL");
}

const { batchUpsertEntries } = await import("../../server/modules/tournaments/tournaments.score-computation.ts");
const { default: prisma } = await import("../../server/core/database/prisma.ts");

const users = (await prisma.user.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 1200 })).map((u) => u.id);
let tournamentId;

async function entries() {
  const rows = await prisma.tournamentEntry.findMany({ where: { tournamentId }, orderBy: { userId: "asc" } });
  return new Map(rows.map((r) => [r.userId, r]));
}

test.before(async () => {
  const t = await prisma.tournament.create({
    data: {
      name: `bulk-upsert-test-${process.pid}`,
      type: "DAILY",
      metric: "CHECKINS",
      startsAt: new Date("2026-10-16T00:00:00Z"),
      endsAt: new Date("2026-10-17T00:00:00Z"),
      status: "SCHEDULED",
    },
  });
  tournamentId = t.id;
});
test.after(async () => {
  if (tournamentId) await prisma.tournament.delete({ where: { id: tournamentId } });
  await prisma.$disconnect();
});

test("creates, updates, skips unchanged and drops zeroed entries", { skip: users.length < 3 }, async () => {
  const [a, b, c] = users;
  await batchUpsertEntries(tournamentId, [{ userId: a, score: 5 }, { userId: b, score: 2 }]);
  let m = await entries();
  assert.equal(m.get(a).score, 5);
  assert.equal(m.get(b).score, 2);
  const bUpdatedAt = m.get(b).updatedAt.getTime();

  await new Promise((r) => setTimeout(r, 20));
  await batchUpsertEntries(tournamentId, [{ userId: a, score: 7 }, { userId: b, score: 2 }, { userId: c, score: 1 }]);
  m = await entries();
  assert.equal(m.get(a).score, 7);
  assert.equal(m.get(c).score, 1);
  assert.equal(m.get(b).updatedAt.getTime(), bUpdatedAt, "unchanged row must not be rewritten");

  await batchUpsertEntries(tournamentId, [{ userId: a, score: 7 }, { userId: c, score: 0 }]);
  m = await entries();
  assert.equal(m.has(b), false, "user no longer scoring is dropped");
  assert.equal(m.has(c), false, "zero score is dropped");
});

test("paid entries are never rewritten nor dropped", { skip: users.length < 3 }, async () => {
  const [a, b] = users;
  await prisma.tournamentEntry.updateMany({ where: { tournamentId, userId: a }, data: { rewardGranted: true } });
  await batchUpsertEntries(tournamentId, [{ userId: a, score: 99 }, { userId: b, score: 3 }]);
  let m = await entries();
  assert.equal(m.get(a).score, 7);
  assert.equal(m.get(b).score, 3);
  await batchUpsertEntries(tournamentId, []);
  m = await entries();
  assert.equal(m.has(a), true, "paid entry survives an empty scoring tick");
  assert.equal(m.has(b), false);
});

test("tie-break is written when given and preserved when not", { skip: users.length < 3 }, async () => {
  const [, b] = users;
  const reached = new Date("2026-10-16T10:15:30.123Z");
  await batchUpsertEntries(tournamentId, [{ userId: b, score: 4, reachedAt: reached }]);
  let m = await entries();
  assert.equal(m.get(b).firstContributionAt.toISOString(), reached.toISOString());

  await batchUpsertEntries(tournamentId, [{ userId: b, score: 6 }]);
  m = await entries();
  assert.equal(m.get(b).score, 6);
  assert.equal(m.get(b).firstContributionAt.toISOString(), reached.toISOString(), "score-only tick keeps tie-break");

  await batchUpsertEntries(tournamentId, [{ userId: b, score: 6, reachedAt: null }]);
  m = await entries();
  assert.equal(m.get(b).firstContributionAt, null, "explicit null clears it, like the old code");
});

test("more rows than one chunk are all written", { skip: users.length <= 1000 }, async () => {
  const rows = users.map((userId, i) => ({ userId, score: i + 1 }));
  await batchUpsertEntries(tournamentId, rows);
  const m = await entries();
  assert.equal(m.size, users.length);
  assert.equal(m.get(users[users.length - 1]).score, users.length);
});
