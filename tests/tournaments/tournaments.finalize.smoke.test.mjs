/**
 * Smoke: the tournament finalize path, against a real database.
 *
 * Covers the three gaps the module README lists under "Lacunas conhecidas",
 * plus the concurrency fix that keyedSingleFlight exists for:
 *
 *   1. finalizing twice pays once — second pass reports 0 and adds no inbox row
 *   2. one broken prize does not cost the other winners theirs (regression F3)
 *   3. cron and the admin finalize button racing produce ONE next cycle, not two
 *
 * Every row created here is namespaced by `tag` and removed in `after`.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

describe("tournament finalize (DB)", { skip: !hasDb }, () => {
  /** @type {import('@prisma/client').PrismaClient | null} */
  let prisma = null;
  let finalizeTournament = null;
  let userA = 0;
  let userB = 0;
  // Short enough that `${tag}-${suffix}` still fits the 24-char username slice
  // with the suffix intact — otherwise both users collide on the same username.
  const tag = `sf${Date.now().toString(36)}`;
  /** Every tournament id this file creates, including spawned recurring cycles. */
  const created = new Set();

  async function makeUser(suffix) {
    const user = await prisma.user.create({
      data: {
        name: `${tag}-${suffix}`.slice(0, 40),
        email: `${tag}-${suffix}@example.test`,
        username: `${tag}-${suffix}`.slice(0, 24),
        passwordHash: "smoke-test-not-a-login",
      },
      select: { id: true },
    });
    return user.id;
  }

  /**
   * An ACTIVE tournament whose window has already closed, ready to finalize.
   * Returns the window so callers can stamp TournamentAction rows inside it —
   * with TOURNAMENT_ENGINE_V2 on, finalize reconciles FAUCET from actions and
   * deletes entries that have no real source score.
   */
  async function makeClosableTournament({ name, recurring = false, prizes }) {
    const startsAt = new Date(Date.now() - 3_600_000);
    const endsAt = new Date(Date.now() - 60_000);
    const t = await prisma.tournament.create({
      data: {
        name,
        type: "DAILY",
        metric: "FAUCET",
        startsAt,
        endsAt,
        status: "ACTIVE",
        recurring,
        prizes: { create: prizes },
      },
      select: { id: true },
    });
    created.add(t.id);
    return { id: t.id, startsAt, endsAt };
  }

  /** Mid-window timestamp so reconcile keeps the claim inside [startsAt, endsAt]. */
  function midWindow(startsAt, endsAt) {
    return new Date((startsAt.getTime() + endsAt.getTime()) / 2);
  }

  async function seedFaucetScore(userId, startsAt, endsAt, actionCount) {
    await prisma.tournamentAction.create({
      data: {
        userId,
        provider: "faucet",
        actionCount,
        executedAtUTC: midWindow(startsAt, endsAt),
        sourceId: `${tag}:faucet:${userId}:${actionCount}:${Date.now()}:${Math.random()}`,
        tournamentEligible: true,
      },
    });
  }

  before(async () => {
    try {
      const { default: prismaMod } = await import("../../server/core/database/prisma.ts");
      prisma = prismaMod;
      ({ finalizeTournament } = await import(
        "../../server/modules/tournaments/tournaments.service.ts"
      ));
      userA = await makeUser("a");
      userB = await makeUser("b");
    } catch (err) {
      prisma = null;
      console.warn(
        "[finalize smoke] skip — DB/Prisma unavailable:",
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  after(async () => {
    if (!prisma) return;
    // Recurring spawns are found by name, since their ids are not known upfront.
    const spawned = await prisma.tournament
      .findMany({ where: { name: { startsWith: tag } }, select: { id: true } })
      .catch(() => []);
    for (const row of spawned) created.add(row.id);

    for (const id of created) {
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId: id } }).catch(() => {});
      await prisma.tournamentPrize.deleteMany({ where: { tournamentId: id } }).catch(() => {});
      await prisma.tournament.delete({ where: { id } }).catch(() => {});
    }
    for (const id of [userA, userB]) {
      if (!id) continue;
      await prisma.tournamentAction.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.userRewardInbox.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.userPowerGame.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it("finalizing twice pays exactly once", async (t) => {
    if (!prisma) return t.skip("DATABASE_URL / Prisma unavailable");

    const { id, startsAt, endsAt } = await makeClosableTournament({
      name: `${tag}-twice`,
      prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 5 }],
    });
    await seedFaucetScore(userA, startsAt, endsAt, 10);

    const first = await finalizeTournament(id);
    assert.equal(first.rewarded, 1, "the first finalize should pay the winner");
    assert.equal(first.failed, 0);

    const second = await finalizeTournament(id);
    assert.equal(second.rewarded, 0, "the second finalize must not pay again");

    const inbox = await prisma.userRewardInbox.findMany({
      where: { userId: userA, source: "tournament" },
    });
    assert.equal(inbox.length, 1, "a second finalize created a duplicate reward row");

    const after = await prisma.tournament.findUnique({ where: { id }, select: { status: true } });
    assert.equal(after.status, "ENDED");
  });

  it("a broken prize does not cost the other winners theirs", async (t) => {
    if (!prisma) return t.skip("DATABASE_URL / Prisma unavailable");

    // rank 1 is a MACHINE prize with no miner row — inserted straight through
    // Prisma, bypassing the admin-side validation on purpose. This is the
    // payout path's own defence.
    const { id, startsAt, endsAt } = await makeClosableTournament({
      name: `${tag}-partial`,
      prizes: [
        { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: null },
        { rankFrom: 2, rankTo: 2, prizeType: "POL", polAmount: 3 },
      ],
    });
    await seedFaucetScore(userA, startsAt, endsAt, 100);
    await seedFaucetScore(userB, startsAt, endsAt, 50);

    const result = await finalizeTournament(id);
    assert.equal(result.failed, 1, "the broken MACHINE prize should be reported as failed");
    assert.equal(result.rewarded, 1, "the rank-2 winner must still have been paid");

    const paid = await prisma.userRewardInbox.findMany({
      where: { userId: userB, source: "tournament" },
    });
    assert.equal(paid.length, 1, "the healthy prize did not reach its winner");

    const unpaidEntry = await prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: userA } },
    });
    assert.equal(
      unpaidEntry.rewardGranted,
      false,
      "an unpayable prize must leave the entry claimable, not flagged as paid",
    );

    const after = await prisma.tournament.findUnique({ where: { id }, select: { status: true } });
    assert.equal(after.status, "ENDED", "phase D must close the tournament even on partial failure");
  });

  it("concurrent finalizes spawn exactly one next cycle", async (t) => {
    if (!prisma) return t.skip("DATABASE_URL / Prisma unavailable");

    // The cron lifecycle tick and POST /admin/tournaments/:id/finalize are two
    // independent callers. Before keyedSingleFlight both could read
    // status=ACTIVE, both entered the recurring branch, and the series forked
    // into two duplicate tournaments.
    const name = `${tag}-recurring`;
    const { id, startsAt, endsAt } = await makeClosableTournament({
      name,
      recurring: true,
      prizes: [{ rankFrom: 1, rankTo: 1, prizeType: "POL", polAmount: 1 }],
    });
    await seedFaucetScore(userA, startsAt, endsAt, 7);

    const [cron, admin] = await Promise.all([finalizeTournament(id), finalizeTournament(id)]);

    const cycles = await prisma.tournament.findMany({
      where: { name, id: { not: id } },
      select: { id: true },
    });
    for (const row of cycles) created.add(row.id);

    assert.equal(cycles.length, 1, `expected exactly one next cycle, got ${cycles.length}`);
    assert.deepEqual(admin, cron, "the joined caller should receive the same result");
    assert.equal(cron.nextId, cycles[0].id);

    const inbox = await prisma.userRewardInbox.findMany({
      where: { userId: userA, source: "tournament" },
    });
    const forThis = inbox.filter((row) => {
      const meta = row.metaJson && typeof row.metaJson === "object" ? row.metaJson : null;
      return meta && meta.tournamentId === id;
    });
    assert.equal(forThis.length, 1, "the concurrent pass paid the prize twice");
  });
});
