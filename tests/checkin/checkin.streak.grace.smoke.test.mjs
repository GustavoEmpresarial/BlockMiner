/**
 * Smoke: real DB path for grace → next-day streak advance.
 * Skips when DATABASE_URL is unset or Prisma cannot connect.
 *
 * Creates a throwaway user, inserts consecutive confirmed days ending with a
 * grace gap, then calls computeStreakAfterCheckin for the next UTC day.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

describe("checkin grace streak smoke (DB)", { skip: !hasDb }, () => {
  /** @type {import('@prisma/client').PrismaClient | null} */
  let prisma = null;
  let userId = 0;
  const tag = `smoke-grace-${Date.now()}`;

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
          polBalance: 0,
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (err) {
      prisma = null;
      userId = 0;
      console.warn("[checkin smoke] skip — DB/Prisma unavailable:", err instanceof Error ? err.message : String(err));
    }
  });

  after(async () => {
    if (!prisma || !userId) return;
    await prisma.dailyCheckin.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("grace day stores 100; next day advances to 101 (not 2)", async (t) => {
    if (!prisma || !userId) {
      t.skip("DATABASE_URL / Prisma unavailable in this environment");
      return;
    }

    await prisma.dailyCheckin.create({
      data: {
        userId,
        checkinDate: "2026-08-28",
        status: "confirmed",
        confirmedAt: new Date("2026-08-28T12:00:00Z"),
        txHash: `${tag}-0828`,
        amount: 0,
        chainId: 0,
        paymentMethod: "balance",
        streak: 99,
        usedGrace: false,
        usedFreeze: false,
      },
    });
    await prisma.dailyCheckin.create({
      data: {
        userId,
        checkinDate: "2026-08-30",
        status: "confirmed",
        confirmedAt: new Date("2026-08-30T01:37:00Z"),
        txHash: `${tag}-0830`,
        amount: 0,
        chainId: 0,
        paymentMethod: "balance",
        streak: 100,
        usedGrace: true,
        usedFreeze: false,
      },
    });

    const { computeStreakAfterCheckin } = await import("../../server/modules/checkin/checkin.streak.ts");
    const { countGraceUsesInMonth, countFreezeUsesInMonth } = await import(
      "../../server/modules/checkin/checkin.repository.ts"
    );
    const { getCheckinGraceHours, getCheckinMaxFreezeUsesPerMonth, getCheckinMaxGraceUsesPerMonth, isCheckinStreakFreezeEnabled } =
      await import("../../server/modules/checkin/checkin.config.ts");

    const nextDay = await computeStreakAfterCheckin(
      { userId, periodKey: "2026-08-31", now: new Date("2026-08-31T14:02:00Z") },
      {
        countGraceUsesInMonth,
        countFreezeUsesInMonth,
        maxGracePerMonth: getCheckinMaxGraceUsesPerMonth(),
        maxFreezePerMonth: getCheckinMaxFreezeUsesPerMonth(),
        freezeEnabled: isCheckinStreakFreezeEnabled(),
        graceHours: getCheckinGraceHours(),
      },
    );

    assert.equal(nextDay.streakAfter, 101);
    assert.equal(nextDay.usedGrace, false);

    const { resolveLiveStreakFromRows } = await import("../../server/modules/checkin/checkin.streak.ts");
    const rows = await prisma.dailyCheckin.findMany({
      where: { userId, status: "confirmed" },
      select: { checkinDate: true, streak: true },
    });
    assert.equal(resolveLiveStreakFromRows(rows, new Date("2026-08-30T12:00:00Z"), 6), 100);
  });
});
