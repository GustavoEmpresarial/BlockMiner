import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeCheckinStreakFromDateKeys } from "../../server/modules/checkin/checkin.streak.ts";

// Period resets at 00:00 UTC (site-wide UTC day boundary — see shared/calendar/utcCalendar.ts).
// Ported from legacy/tests/checkin/checkinStreak.test.mjs, adapted from the legacy 21h BRT reset.

describe("computeCheckinStreakFromDateKeys", () => {
  it("keeps the streak on the next day before today's check-in", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(["2026-04-28", "2026-04-27", "2026-04-26"], now);
    assert.equal(streak, 3);
  });

  it("counts legacy same-day keys instead of resetting to zero", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(["4/28/2026", "2026-04-27", "2026-4-26"], now);
    assert.equal(streak, 3);
  });

  it("resets only when there is a real gap in the previous day", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(["2026-04-27", "2026-04-26", "2026-04-24"], now);
    assert.equal(streak, 0);
  });

  it("starts a new streak at one after a comeback check-in", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(["2026-04-29", "2026-04-27", "2026-04-26"], now);
    assert.equal(streak, 1);
  });

  it("returns 0 for empty history", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    assert.equal(computeCheckinStreakFromDateKeys([], now), 0);
  });

  it("correctly identifies period key just after the UTC midnight reset", () => {
    const now = new Date("2026-04-29T00:00:01Z");
    const streak = computeCheckinStreakFromDateKeys(["2026-04-28", "2026-04-27"], now);
    assert.equal(streak, 2);
  });

  it("one second before the UTC midnight reset: same-day check-in still counts", () => {
    const now = new Date("2026-04-28T23:59:59Z");
    const streak = computeCheckinStreakFromDateKeys(["2026-04-28", "2026-04-27", "2026-04-26"], now);
    assert.equal(streak, 3);
  });

  it("keys in any order produce the same streak (Set-based, order-independent)", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const keysAsc = ["2026-04-26", "2026-04-27", "2026-04-28"];
    const keysDesc = ["2026-04-28", "2026-04-27", "2026-04-26"];
    const keysMixed = ["2026-04-27", "2026-04-28", "2026-04-26"];
    assert.equal(computeCheckinStreakFromDateKeys(keysAsc, now), 3);
    assert.equal(computeCheckinStreakFromDateKeys(keysDesc, now), 3);
    assert.equal(computeCheckinStreakFromDateKeys(keysMixed, now), 3);
  });

  it("simulates streak recovery: keys include 2 missed days filled in, streak continues", () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const keys = ["2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"];
    assert.equal(computeCheckinStreakFromDateKeys(keys, now), 7);
  });

  it("grace window: shows pre-gap streak when within 6h of missed period reset", () => {
    const now = new Date("2026-04-29T06:00:00Z");
    const keys = ["2026-04-27", "2026-04-26", "2026-04-25"];
    assert.equal(computeCheckinStreakFromDateKeys(keys, now, 6), 3);
  });

  it("grace window disabled (graceHours=0) — no pre-gap streak shown", () => {
    const now = new Date("2026-04-29T06:00:00Z");
    const keys = ["2026-04-27", "2026-04-26", "2026-04-25"];
    assert.equal(computeCheckinStreakFromDateKeys(keys, now, 0), 0);
  });
});
