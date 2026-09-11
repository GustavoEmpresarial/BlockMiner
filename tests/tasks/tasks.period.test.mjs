import test from "node:test";
import assert from "node:assert/strict";

const period = await import("../../server/modules/tasks/tasks.period.ts");

test("getDailyTaskPeriodKey (DAILY) uses UTC 00:00 day boundary, not BRT", () => {
  // 2026-08-08T02:30:00Z is still 2026-08-07 23:30 in America/Sao_Paulo (UTC-3), but the UTC
  // calendar day is already 2026-08-08.
  const d = new Date("2026-08-08T02:30:00.000Z");
  assert.equal(period.getDailyTaskPeriodKey(d), "2026-08-08");
});

test("getNextDailyTaskResetAt (DAILY) aligns on the next UTC midnight", () => {
  const d = new Date("2026-08-08T23:00:00.000Z");
  const next = period.getNextDailyTaskResetAt(d);
  assert.equal(next.toISOString(), "2026-08-09T00:00:00.000Z");
});

test("normalizeDailyTaskResetCadence defaults unknown values to DAILY", () => {
  assert.equal(period.normalizeDailyTaskResetCadence("bogus"), "DAILY");
  assert.equal(period.normalizeDailyTaskResetCadence(undefined), "DAILY");
  assert.equal(period.normalizeDailyTaskResetCadence("weekly"), "WEEKLY");
  assert.equal(period.normalizeDailyTaskResetCadence("MONTHLY"), "MONTHLY");
});

test("getDailyTaskPeriodKey (WEEKLY) returns an ISO week key", () => {
  const d = new Date("2026-08-08T12:00:00.000Z"); // a Saturday
  const key = period.getDailyTaskPeriodKey(d, "WEEKLY");
  assert.match(key, /^\d{4}-W\d{2}$/);
});

test("getNextDailyTaskResetAt (WEEKLY) lands on next Monday 00:00 UTC", () => {
  const d = new Date("2026-08-08T12:00:00.000Z"); // Saturday 2026-08-08
  const next = period.getNextDailyTaskResetAt(d, "WEEKLY");
  assert.equal(next.getUTCDay(), 1); // Monday
  assert.equal(next.getUTCHours(), 0);
  assert.ok(next.getTime() > d.getTime());
});

test("getDailyTaskPeriodKey (MONTHLY) returns YYYY-MM", () => {
  const d = new Date("2026-08-08T12:00:00.000Z");
  assert.equal(period.getDailyTaskPeriodKey(d, "MONTHLY"), "2026-08");
});

test("getNextDailyTaskResetAt (MONTHLY) lands on the 1st of next month, 00:00 UTC", () => {
  const d = new Date("2026-08-08T12:00:00.000Z");
  const next = period.getNextDailyTaskResetAt(d, "MONTHLY");
  assert.equal(next.toISOString(), "2026-09-01T00:00:00.000Z");
});
