import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const {
  FULL_WEEK_RATE,
  DAILY_WEEK_RATE,
  DAILY_PER_DAY_RATE,
  AUTO_PER_DAY_RATE,
  ENERGY_TAX_STARTS_AT,
  isEnergyTaxActive,
  isEnergyTaxAutoSweepDay,
  isTaxableDay,
  firstTaxableDayStart,
  lastSevenClosedMiningPeriodStarts,
  lastSevenMiningPeriodStarts,
  lastSevenUtcDays,
  miningBreakdownForUtcDay,
  computeConsecutiveUnpaidMiningDays,
  checkAndUpdateEnergyBlock,
  computeWeekSummary,
  payDailyTax,
  runWeeklySweep,
} = await import("../../server/modules/energy-tax/energy-tax.service.ts");
const { EnergyTaxAlreadyPaid, EnergyTaxNotStarted } = await import(
  "../../server/modules/energy-tax/energy-tax.errors.ts"
);

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `etax_srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: "Energy Tax Service Test User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "127.0.0.1",
      ip: "127.0.0.1",
      userAgent: "test-runner/1.0",
      polBalance: "0",
      blkBalance: "0",
      shibBalance: "0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  for (const id of createdUserIds) {
    await prisma.energyTaxCharge.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.zeradsCallback.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.shortlinkPower.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.transaction.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id: id } }).catch(() => {});
  }
});

/* =========================================================================
 * Constantes e Funções Puras de Calendário e Taxas
 * ========================================================================= */

test("FULL_WEEK_RATE — equals 15%", () => {
  assert.equal(FULL_WEEK_RATE, 0.15);
});

test("DAILY_WEEK_RATE — equals 5%", () => {
  assert.equal(DAILY_WEEK_RATE, 0.05);
});

test("DAILY_PER_DAY_RATE — equals DAILY_WEEK_RATE / 7", () => {
  assert.ok(Math.abs(DAILY_PER_DAY_RATE - 0.05 / 7) < 0.0001);
});

test("AUTO_PER_DAY_RATE — equals FULL_WEEK_RATE / 7", () => {
  assert.ok(Math.abs(AUTO_PER_DAY_RATE - 0.15 / 7) < 0.0001);
});

test("DAILY_WEEK_RATE < FULL_WEEK_RATE — daily payment is cheaper", () => {
  assert.ok(DAILY_WEEK_RATE < FULL_WEEK_RATE);
});

test("DAILY_WEEK_RATE ≈ DAILY_PER_DAY_RATE * 7", () => {
  assert.ok(Math.abs(DAILY_PER_DAY_RATE * 7 - DAILY_WEEK_RATE) < 0.0001);
});

test("ENERGY_TAX_STARTS_AT — is a valid Date", () => {
  assert.ok(ENERGY_TAX_STARTS_AT instanceof Date);
  assert.ok(!Number.isNaN(ENERGY_TAX_STARTS_AT.getTime()));
});

test("isEnergyTaxActive — true after start date", () => {
  const future = new Date("2026-12-01T00:00:00Z");
  assert.equal(isEnergyTaxActive(future), true);
});

test("isEnergyTaxActive — false before start date", () => {
  const past = new Date("2026-01-01T00:00:00Z");
  assert.equal(isEnergyTaxActive(past), false);
});

test("isEnergyTaxActive — uses default now when omitted", () => {
  const result = isEnergyTaxActive();
  assert.equal(typeof result, "boolean");
});

test("firstTaxableDayStart — is not NaN", () => {
  const start = firstTaxableDayStart();
  assert.ok(start instanceof Date);
  assert.ok(!Number.isNaN(start.getTime()));
});

test("isTaxableDay — true for date after first taxable day", () => {
  const firstDay = firstTaxableDayStart();
  const later = new Date(firstDay.getTime() + 86400000);
  assert.equal(isTaxableDay(later), true);
});

test("isTaxableDay — first taxable day itself is taxable", () => {
  const firstDay = firstTaxableDayStart();
  assert.equal(isTaxableDay(firstDay), true);
});

test("isEnergyTaxAutoSweepDay — only Monday UTC", () => {
  assert.equal(isEnergyTaxAutoSweepDay(new Date("2026-08-24T12:00:00.000Z")), true); // Mon
  assert.equal(isEnergyTaxAutoSweepDay(new Date("2026-08-25T12:00:00.000Z")), false); // Tue
  assert.equal(isEnergyTaxAutoSweepDay(new Date("2026-08-26T03:00:00.000Z")), false); // Wed
  assert.equal(isEnergyTaxAutoSweepDay(new Date("2026-08-30T23:00:00.000Z")), false); // Sun
});

test("lastSevenUtcDays & lastSevenMiningPeriodStarts — consistency", () => {
  const now = new Date();
  const days1 = lastSevenUtcDays(now);
  const days2 = lastSevenMiningPeriodStarts(now);
  assert.equal(days1.length, 7);
  assert.equal(days2.length, 7);
  assert.deepEqual(days1, days2);
});

test("lastSevenClosedMiningPeriodStarts — on Monday includes previous Monday, excludes today", () => {
  const monday = new Date("2026-08-31T12:00:00.000Z");
  const closed = lastSevenClosedMiningPeriodStarts(monday);
  const rolling = lastSevenMiningPeriodStarts(monday);
  assert.equal(closed.length, 7);
  assert.equal(rolling.length, 7);
  assert.ok(closed[6].getTime() < rolling[6].getTime());
  assert.ok(closed[0].getTime() < rolling[0].getTime());
});

/* =========================================================================
 * Regras de Negócio e Serviços com Persistência Real
 * ========================================================================= */

test("miningBreakdownForUtcDay — returns breakdown of rewards for a given UTC day", async () => {
  const user = await makeUser();
  const dayStart = new Date("2026-09-01T00:00:00.000Z");

  const breakdown = await miningBreakdownForUtcDay(user.id, dayStart);
  assert.equal(breakdown.total, 0);
  assert.equal(breakdown.blockMiner, 0);
  assert.equal(breakdown.zerads, 0);
});

test("checkAndUpdateEnergyBlock — clears energyBlocked flag if user was blocked", async () => {
  const user = await makeUser({ energyBlocked: true });
  const cleared = await checkAndUpdateEnergyBlock(user.id);
  assert.equal(cleared, false);

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(updated.energyBlocked, false);

  // Calling again when not blocked returns false without error
  const again = await checkAndUpdateEnergyBlock(user.id);
  assert.equal(again, false);
});

test("computeConsecutiveUnpaidMiningDays & computeWeekSummary — tracks unpaid and categorized paid days", async () => {
  const user = await makeUser({ polBalance: "100.0", blkBalance: "50.0" });
  const now = new Date();
  const days = lastSevenMiningPeriodStarts(now);

  // Seed rewards on 3 days
  const day1 = days[1];
  const day2 = days[2];
  const day3 = days[3];

  for (const d of [day1, day2, day3]) {
    await prisma.zeradsCallback.create({
      data: {
        userId: user.id,
        username: user.username,
        amountZer: 10,
        exchangeRate: 1,
        payoutAmount: 1.0,
        clicks: 1,
        callbackHash: `hash_days_${d.getTime()}_${Math.random()}`,
        callbackAt: new Date(d.getTime() + 3600 * 1000),
      },
    });
  }

  // Create an existing 'daily' charge on day1
  await prisma.energyTaxCharge.create({
    data: {
      userId: user.id,
      periodDayStartsAt: day1,
      mode: "daily",
      rewardsBase: "1.0",
      ratePercent: "0.7143",
      amount: "0.007143",
      status: "paid",
    },
  });

  // Create an existing 'auto' charge on day2
  await prisma.energyTaxCharge.create({
    data: {
      userId: user.id,
      periodDayStartsAt: day2,
      mode: "auto",
      rewardsBase: "1.0",
      ratePercent: "2.1429",
      amount: "0.021429",
      status: "paid",
    },
  });

  // Create an existing 'exempt' charge on day3
  await prisma.energyTaxCharge.create({
    data: {
      userId: user.id,
      periodDayStartsAt: day3,
      mode: "exempt",
      rewardsBase: "1.0",
      ratePercent: "0",
      amount: "0",
      status: "paid",
    },
  });

  const summary = await computeWeekSummary(user.id, now);
  assert.ok(summary);
  assert.equal(summary.active, true);
  assert.ok(summary.paidDays >= 3);
  assert.ok(summary.paidDaysManual >= 1);
  assert.ok(summary.paidDaysAuto >= 1);
  assert.ok(summary.paidDaysExempt >= 1);
  assert.ok(summary.totalRewards7d >= 3.0);
  assert.ok(summary.history.length >= 3);
});

test("payDailyTax — creates exempt charge with zero amount when user completed 10 activities today", async () => {
  const user = await makeUser({ polBalance: "50.0" });
  const now = new Date();
  const taxedDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
  const currentPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

  // Seed yesterday rewards
  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 10,
      exchangeRate: 1,
      payoutAmount: 2.0,
      clicks: 1,
      callbackHash: `cb_exempt_r_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  // Seed 10 activities today (shortlinkPower claims)
  for (let i = 0; i < 10; i++) {
    await prisma.shortlinkPower.create({
      data: {
        userId: user.id,
        hashRate: 10,
        claimedAt: new Date(currentPeriodStart.getTime() + 1000 * (i + 1)),
        expiresAt: new Date(currentPeriodStart.getTime() + 86400000),
      },
    });
  }

  const charge = await payDailyTax(user.id, "POL", now);
  assert.ok(charge);
  assert.equal(charge.mode, "exempt");
  assert.equal(Number(charge.amount), 0);
  assert.ok(charge.notes?.includes("Isento"));

  // Balance was NOT debited
  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(Number(freshUser.polBalance), 50.0);
});

test("payDailyTax — settles with alternative currencies BLK and SHIB recording respective notes", async () => {
  const user = await makeUser({ polBalance: "0", blkBalance: "100.0", shibBalance: "5000000" });
  const now = new Date("2026-09-10T12:00:00Z");
  const taxedDay = new Date("2026-09-09T00:00:00Z");

  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 10,
      exchangeRate: 1,
      payoutAmount: 1.0,
      clicks: 1,
      callbackHash: `cb_blk_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  const charge = await payDailyTax(user.id, "BLK", now);
  assert.ok(charge);
  assert.equal(charge.mode, "daily");
  assert.ok(charge.notes?.includes("paidCurrency=BLK"));

  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(Number(freshUser.blkBalance) < 100.0);
});

test("payDailyTax — proves that on P2002 unique constraint conflict balance is NOT debited and error throws EnergyTaxAlreadyPaid", async () => {
  const user = await makeUser({ polBalance: "100.0" });
  const now = new Date();
  const taxedDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));

  await prisma.zeradsCallback.create({
    data: {
      userId: user.id,
      username: user.username,
      amountZer: 10,
      exchangeRate: 1,
      payoutAmount: 5.0,
      clicks: 1,
      callbackHash: `cb_race_${Date.now()}_${Math.random()}`,
      callbackAt: new Date(taxedDay.getTime() + 3600 * 1000),
    },
  });

  // Pre-insert an EnergyTaxCharge row to simulate another request winning the race
  await prisma.energyTaxCharge.create({
    data: {
      userId: user.id,
      periodDayStartsAt: taxedDay,
      mode: "daily",
      rewardsBase: "5.0",
      ratePercent: "0.7143",
      amount: "0.035715",
      status: "paid",
    },
  });

  // Attempting payDailyTax must catch the collision, leave balance untouched, and throw EnergyTaxAlreadyPaid
  await assert.rejects(
    async () => payDailyTax(user.id, "POL", now),
    (err) => {
      assert.ok(err instanceof EnergyTaxAlreadyPaid);
      return true;
    },
  );

  const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(Number(freshUser.polBalance), 100.0); // Saldo estritamente intacto
});

test("payDailyTax — throws EnergyTaxNotStarted when called before feature start date", async () => {
  const user = await makeUser();
  const pastDate = new Date("2025-01-01T00:00:00Z");
  await assert.rejects(
    async () => payDailyTax(user.id, "POL", pastDate),
    (err) => {
      assert.ok(err instanceof EnergyTaxNotStarted);
      return true;
    },
  );
});

test("payDailyTax — throws EnergyTaxNoRewards when taxedDay is before firstTaxableDayStart", async () => {
  const user = await makeUser();
  await assert.rejects(
    async () => payDailyTax(user.id, "POL", ENERGY_TAX_STARTS_AT),
    /EnergyTaxNoRewards|não possui recompensas/,
  );
});

/* =========================================================================
 * Sweep Semanal Automático (runWeeklySweep) - Cobertura de Segunda-Feira UTC
 * ========================================================================= */

test("runWeeklySweep — no-op before feature startsAt date", async () => {
  const pastMonday = new Date("2025-01-06T00:00:00.000Z"); // Monday before start
  const result = await runWeeklySweep(pastMonday);
  assert.deepEqual(result, { touched: 0, chargesCreated: 0 });
});

test("runWeeklySweep — executes Monday auto sweep on unpaid days covering paid, partial and skipped regimes", async () => {
  // Monday UTC
  const mondayNow = new Date("2026-08-31T03:00:00.000Z");
  const closedDays = lastSevenClosedMiningPeriodStarts(mondayNow);

  // User A has plenty of balance
  const userA = await makeUser({ polBalance: "100.0" });
  // User B has partial balance
  const userB = await makeUser({ polBalance: "0.001" });
  // User C has zero balance
  const userC = await makeUser({ polBalance: "0" });

  const targetDay = closedDays[1]; // Tuesday in window

  for (const u of [userA, userB, userC]) {
    await prisma.zeradsCallback.create({
      data: {
        userId: u.id,
        username: u.username,
        amountZer: 10,
        exchangeRate: 1,
        payoutAmount: 2.0,
        clicks: 1,
        callbackHash: `sweep_cb_${u.id}_${Date.now()}_${Math.random()}`,
        callbackAt: new Date(targetDay.getTime() + 3600 * 1000),
      },
    });
  }

  const result = await runWeeklySweep(mondayNow);
  assert.ok(result.touched >= 3);
  assert.ok(result.chargesCreated >= 3);

  // Check user A had auto paid charge
  const chargeA = await prisma.energyTaxCharge.findUnique({
    where: { userId_periodDayStartsAt: { userId: userA.id, periodDayStartsAt: targetDay } },
  });
  assert.ok(chargeA);
  assert.equal(chargeA.mode, "auto");
  assert.equal(chargeA.status, "paid");

  // Check user B had partial charge
  const chargeB = await prisma.energyTaxCharge.findUnique({
    where: { userId_periodDayStartsAt: { userId: userB.id, periodDayStartsAt: targetDay } },
  });
  assert.ok(chargeB);
  assert.equal(chargeB.mode, "auto");
  assert.equal(chargeB.status, "partial");

  // Check user C had skipped charge
  const chargeC = await prisma.energyTaxCharge.findUnique({
    where: { userId_periodDayStartsAt: { userId: userC.id, periodDayStartsAt: targetDay } },
  });
  assert.ok(chargeC);
  assert.equal(chargeC.mode, "auto");
  assert.equal(chargeC.status, "skipped");
});
