import test from "node:test";
import assert from "node:assert/strict";

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
  runWeeklySweep,
} = await import("../../server/modules/energy-tax/energy-tax.service.ts");

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

test("runWeeklySweep — no-op mid-week (does not charge auto)", async () => {
  const wed = new Date("2026-08-26T03:00:00.000Z");
  const result = await runWeeklySweep(wed);
  assert.deepEqual(result, { touched: 0, chargesCreated: 0 });
});

test("lastSevenClosedMiningPeriodStarts — on Monday includes previous Monday, excludes today", () => {
  const monday = new Date("2026-08-31T12:00:00.000Z");
  const closed = lastSevenClosedMiningPeriodStarts(monday);
  const rolling = lastSevenMiningPeriodStarts(monday);
  assert.equal(closed.length, 7);
  assert.equal(rolling.length, 7);
  // Rolling on Monday ends with Monday; closed ends with Sunday
  assert.ok(closed[6].getTime() < rolling[6].getTime());
  // Closed window starts one day earlier than rolling (previous Mon vs Tue)
  assert.ok(closed[0].getTime() < rolling[0].getTime());
});
