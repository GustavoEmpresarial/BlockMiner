/**
 * Smoke: create ACTIVE FAUCET tournament + insert TournamentAction → reconcile scores.
 * Skips when DATABASE_URL / Prisma unavailable.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

describe("tournament FAUCET metric smoke (DB)", { skip: !hasDb }, () => {
  /** @type {import('@prisma/client').PrismaClient | null} */
  let prisma = null;
  let userId = 0;
  let tournamentId = 0;
  const tag = `smoke-faucet-${Date.now()}`;

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
      console.warn("[tournament smoke] skip — DB/Prisma unavailable:", err instanceof Error ? err.message : String(err));
    }
  });

  after(async () => {
    if (!prisma) return;
    if (tournamentId) {
      await prisma.tournamentEntry.deleteMany({ where: { tournamentId } }).catch(() => {});
      await prisma.tournamentPrize.deleteMany({ where: { tournamentId } }).catch(() => {});
      await prisma.tournament.delete({ where: { id: tournamentId } }).catch(() => {});
    }
    if (userId) {
      await prisma.tournamentAction.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  it("reconcile FAUCET tournament counts tournament actions", async (t) => {
    if (!prisma || !userId) {
      t.skip("DATABASE_URL / Prisma unavailable");
      return;
    }

    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 3_600_000);
    const tournament = await prisma.tournament.create({
      data: {
        name: tag,
        type: "DAILY",
        metric: "FAUCET",
        startsAt,
        endsAt,
        status: "ACTIVE",
        recurring: false,
      },
      select: { id: true, name: true, metric: true, startsAt: true, endsAt: true, status: true },
    });
    tournamentId = tournament.id;

    await prisma.tournamentAction.create({
      data: {
        userId,
        provider: "faucet",
        actionCount: 1,
        executedAtUTC: new Date(),
        sourceId: `faucet-smoke:${userId}:${Date.now()}`,
        tournamentEligible: true,
      },
    });

    const { computeScoresForTournament } = await import(
      "../../server/modules/tournaments/tournaments.score-computation.ts"
    );
    await computeScoresForTournament(tournament);

    const entry = await prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    assert.ok(entry);
    assert.equal(Number(entry.score), 1);
  });
});
