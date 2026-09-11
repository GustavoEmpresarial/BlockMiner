import test from "node:test";
import assert from "node:assert/strict";

const cal = await import("../../server/shared/calendar/utcCalendar.ts");

test("getUtcDayKey formats as YYYY-MM-DD in UTC", () => {
  const key = cal.getUtcDayKey(new Date("2026-05-19T12:00:00Z"));
  assert.equal(key, "2026-05-19");
});

test("getUtcIsoWeekKey returns ISO week in UTC", () => {
  const key = cal.getUtcIsoWeekKey(new Date("2026-05-19T12:00:00Z"));
  assert.match(key, /^\d{4}-W\d{2}$/);
});


test("getUtcDayKey rolls over exactly at UTC midnight, not before", () => {
  assert.equal(cal.getUtcDayKey(new Date("2026-05-19T23:59:59Z")), "2026-05-19");
  assert.equal(cal.getUtcDayKey(new Date("2026-05-20T00:00:00Z")), "2026-05-20");
});

test("normalizeUtcDayKey accepts dash, slash, and mdy formats consistently", () => {
  assert.equal(cal.normalizeUtcDayKey("2026-05-19"), "2026-05-19");
  assert.equal(cal.normalizeUtcDayKey("2026/05/19"), "2026-05-19");
  assert.equal(cal.normalizeUtcDayKey("05/19/2026"), "2026-05-19");
  assert.equal(cal.normalizeUtcDayKey("not-a-date"), "");
});

test("addDaysToUtcDayKey shifts whole UTC calendar days", () => {
  assert.equal(cal.addDaysToUtcDayKey("2026-05-19", 1), "2026-05-20");
  assert.equal(cal.addDaysToUtcDayKey("2026-05-19", -1), "2026-05-18");
});

test("getUtcPeriodResetAt returns the next UTC midnight after the given day key", () => {
  const resetAt = cal.getUtcPeriodResetAt("2026-05-19");
  assert.equal(resetAt.toISOString(), "2026-05-20T00:00:00.000Z");
});

test("getUtcPeriodStartAt returns the UTC midnight the day key begins at", () => {
  const startAt = cal.getUtcPeriodStartAt("2026-05-19");
  assert.equal(startAt.toISOString(), "2026-05-19T00:00:00.000Z");
});

test("isSameUtcDay compares normalized keys regardless of textual format", () => {
  assert.equal(cal.isSameUtcDay("2026-05-19", "2026/05/19"), true);
  assert.equal(cal.isSameUtcDay("2026-05-19", "2026-05-20"), false);
});

test("getUtcDayKeyLookupKeys includes the normalized key and its textual aliases", () => {
  const keys = cal.getUtcDayKeyLookupKeys("2026-05-19");
  assert.ok(keys.includes("2026-05-19"));
  assert.ok(keys.includes("05/19/2026"));
});
