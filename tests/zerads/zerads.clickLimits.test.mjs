import test from "node:test";
import assert from "node:assert/strict";

const { aggregateZeradsClicksPerUser, capZeradsClicksForUtcDay, ZERADS_MAX_CLICKS_PER_UTC_DAY, zeradsUtcDayBounds } = await import(
  "../../server/modules/zerads/zerads.limits.ts"
);

test("capZeradsClicksForUtcDay caps each UTC day at platform max", () => {
  assert.equal(capZeradsClicksForUtcDay(0), 0);
  assert.equal(capZeradsClicksForUtcDay(69), 69);
  assert.equal(capZeradsClicksForUtcDay(159), ZERADS_MAX_CLICKS_PER_UTC_DAY);
});

test("aggregateZeradsClicksPerUser aggregates per user with per-day cap", () => {
  const day = new Date("2026-07-01T12:00:00.000Z");
  const map = aggregateZeradsClicksPerUser([
    { userId: 90, callbackAt: day, clicks: 80 },
    { userId: 90, callbackAt: new Date("2026-07-01T18:00:00.000Z"), clicks: 79 },
  ]);
  const t = map.get(90);
  assert.equal(t?.raw, 159);
  assert.equal(t?.credited, 100);
});

test("zeradsUtcDayBounds uses the site-wide UTC 00:00 boundary, not America/Sao_Paulo 21h", () => {
  const now = new Date("2026-07-01T23:30:00.000Z");
  const { start, end } = zeradsUtcDayBounds(now);
  assert.equal(start.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-02T00:00:00.000Z");
});

test("zeradsUtcDayBounds bucket boundary is exclusive of the next day", () => {
  const justBeforeMidnight = new Date("2026-07-01T23:59:59.999Z");
  const justAfterMidnight = new Date("2026-07-02T00:00:00.000Z");
  const boundsBefore = zeradsUtcDayBounds(justBeforeMidnight);
  const boundsAfter = zeradsUtcDayBounds(justAfterMidnight);
  assert.notEqual(boundsBefore.start.toISOString(), boundsAfter.start.toISOString());
});
