/**
 * Smoke: finalize a MINING_BOOST tournament credits userPowerGame immediately
 * and does not leave a pending reward-inbox row.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

describe("tournament MINING_BOOST direct power (DB)", { skip: !hasDb }, () => {
  /** @type {import('@prisma/client').PrismaClient | null} */
  let prisma = null;
  let userId = 0;
  let tournamentId = 0;
  const tag = `smoke-boost-${Date.now()}`;

  before(async () => {
    try {
      const { default: prismaMod } = await import("../../server/core/database/prisma.ts");
      prisma = prismaMod;
      const user = await prisma.user.create({
        data: {
          name: tag.slice(0, 40),
          email: `${tag}@example.test`,
          username: tag.slice(0, 24),
          passwordHash: "smoke-test-not-a-login",
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (err) {
      prisma = null;
      userId = 0;
      console.warn("[tournament boost smoke] skip — DB/Prisma unavailable:", err instanceof Error ? err.message : String(err));
    }
  });

  after(async () => {
    if (!prisma) return;
    if (userId) {
      await prisma.userPowerGame.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRewardInbox.deleteMany({ where: { userId } }).catch(() => {});
    }
    if (tournamentId) {
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } }).catch(() => {});
      await prisma.tournamentPrize.deleteMany({ where: { tournamentId } }).catch(() => {});
      await prisma.tournament.delete({ where: { id: tournamentId } }).catch(() => {});
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  it("finalize writes power, not a pending inbox item", async (t) => {
    if (!prisma || !userId) {
      t.skip("DATABASE_URL / Prisma unavailable");
      return;
    }

    const boostHashRate = 150;
    const boostHours = 12;
    const startsAt = new Date(Date.now() - 3_600_000);
    const endsAt = new Date(Date.now() - 60_000);
    const tournament = await prisma.tournament.create({
      data: {
        name: tag,
        type: "DAILY",
        metric: "FAUCET",
        startsAt,
        endsAt,
        status: "ACTIVE",
        recurring: false,
        prizes: {
          create: {
            rankFrom: 1,
            rankTo: 1,
            prizeType: "MINING_BOOST",
            boostHashRate,
            boostHours,
          },
        },
      },
      select: { id: true },
    });
    tournamentId = tournament.id;

    await prisma.tournamentEntry.create({
      data: { tournamentId, userId, score: 3 },
    });

    const { finalizeTournament } = await import("../../server/modules/tournaments/tournaments.service.ts");
    const result = await finalizeTournament(tournamentId);
    assert.equal(result.rewarded, 1);

    const inbox = await prisma.userRewardInbox.findMany({
      where: { userId, source: "tournament" },
    });
    assert.equal(inbox.length, 0, "MINING_BOOST must not land in reward inbox");

    const game = await prisma.game.findUnique({ where: { slug: "tournament-mining-boost" } });
    assert.ok(game, "tournament-mining-boost game row");

    const powers = await prisma.userPowerGame.findMany({
      where: { userId, gameId: game.id },
    });
    assert.equal(powers.length, 1);
    assert.equal(powers[0].hashRate, boostHashRate);
    const ttlMs = powers[0].expiresAt.getTime() - powers[0].playedAt.getTime();
    assert.equal(ttlMs, boostHours * 60 * 60 * 1000);
  });
});
