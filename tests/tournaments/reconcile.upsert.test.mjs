/**
 * Integration: drift correction (batchUpsertEntriesFromReconcile) against the local/dev Postgres.
 * It used to delete paid entries and rewrite their score; it must now behave like the scoring tick.
 */
import test from "node:test";
import assert from "node:assert/strict";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("reconcile.upsert.test requires a local DATABASE_URL");
}

const { batchUpsertEntriesFromReconcile } = await import("../../server/modules/tournaments/tournaments.repository.ts");
const { default: prisma } = await import("../../server/core/database/prisma.ts");

const users = (await prisma.user.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 3 })).map((u) => u.id);
let tournamentId;

const entries = async () =>
  new Map((await prisma.tournamentEntry.findMany({ where: { tournamentId } })).map((r) => [r.userId, r]));

test.before(async () => {
  const t = await prisma.tournament.create({
    data: {
      name: `reconcile-test-${process.pid}`,
      type: "DAILY",
      metric: "DEPOSITS_POL",
      startsAt: new Date("2026-10-16T00:00:00Z"),
      endsAt: new Date("2026-10-17T00:00:00Z"),
      status: "ACTIVE",
    },
  });
  tournamentId = t.id;
});
test.after(async () => {
  if (tournamentId) await prisma.tournament.delete({ where: { id: tournamentId } });
  await prisma.$disconnect();
});

test("corrects drift, drops non-scoring unpaid users, never touches paid entries, keeps tie-break", { skip: users.length < 3 }, async () => {
  const [paid, a, b] = users;
  const reached = new Date("2026-10-16T08:00:00.000Z");
  await prisma.tournamentEntry.createMany({
    data: [
      { tournamentId, userId: paid, score: 50, rewardGranted: true },
      { tournamentId, userId: a, score: 1, firstContributionAt: reached },
      { tournamentId, userId: b, score: 9 },
    ],
  });

  // Reconcile says: paid user now 99 (must be ignored), a = 4, b no longer scores.
  await batchUpsertEntriesFromReconcile(tournamentId, [
    { userId: paid, score: 99 },
    { userId: a, score: 4 },
  ]);
  let m = await entries();
  assert.equal(m.get(paid).score, 50, "paid entry score not rewritten");
  assert.equal(m.get(a).score, 4, "drift corrected");
  assert.equal(m.get(a).firstContributionAt.toISOString(), reached.toISOString(), "tie-break kept");
  assert.equal(m.has(b), false, "unpaid user no longer scoring is dropped");

  // Empty reconcile (nobody scores) must still keep the paid entry.
  await batchUpsertEntriesFromReconcile(tournamentId, []);
  m = await entries();
  assert.equal(m.has(paid), true, "paid entry survives an empty reconcile");
  assert.equal(m.has(a), false);
});
