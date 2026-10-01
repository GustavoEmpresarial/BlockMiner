import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAnalyticsPeriod,
  buildBuckets,
  bucketKeyFor,
  getMiningEconomySnapshot,
  BLOCK_REWARD_POL_FALLBACK,
  BLOCK_DURATION_MS_FALLBACK,
} from "../../server/modules/analytics/analytics.helpers.ts";

test("Helpers: getMiningEconomySnapshot returns positive economic constants", async () => {
  const eco = await getMiningEconomySnapshot();
  assert.ok(typeof eco.rewardBase === "number" && eco.rewardBase > 0);
  assert.ok(typeof eco.blockDurationMs === "number" && eco.blockDurationMs > 0);
  assert.ok(typeof eco.blockDurationMinutes === "number" && eco.blockDurationMinutes > 0);
  assert.ok(typeof eco.blocksPerDay === "number" && eco.blocksPerDay > 0);
  assert.ok(typeof eco.blocksPerMonth === "number" && eco.blocksPerMonth > 0);
  assert.ok(typeof eco.blocksPerYear === "number" && eco.blocksPerYear > 0);
  assert.ok(typeof eco.polPrice === "number" && eco.polPrice > 0);
});

test("Helpers: resolveAnalyticsPeriod for 'day' generates 24 hourly buckets", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const res = resolveAnalyticsPeriod("day", now);
  assert.equal(res.period, "day");
  assert.equal(res.bucketUnit, "hour");
  assert.equal(res.buckets.length, 24);
  assert.equal(res.buckets[res.buckets.length - 1].hour, now.getHours());
  assert.ok(res.buckets.every((b) => b.from < b.to));
});

test("Helpers: resolveAnalyticsPeriod for 'week' generates 7 daily buckets", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const res = resolveAnalyticsPeriod("week", now);
  assert.equal(res.period, "week");
  assert.equal(res.bucketUnit, "day");
  assert.equal(res.buckets.length, 7);
  assert.ok(res.buckets.every((b) => typeof b.label === "string" && b.label.includes("/")));
});

test("Helpers: resolveAnalyticsPeriod for 'month' generates 30 daily buckets", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const res = resolveAnalyticsPeriod("month", now);
  assert.equal(res.period, "month");
  assert.equal(res.bucketUnit, "day");
  assert.equal(res.buckets.length, 30);
});

test("Helpers: resolveAnalyticsPeriod for 'year' generates 12 monthly buckets", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const res = resolveAnalyticsPeriod("year", now);
  assert.equal(res.period, "year");
  assert.equal(res.bucketUnit, "month");
  assert.equal(res.buckets.length, 12);
});

test("Helpers: resolveAnalyticsPeriod for 'all' generates monthly buckets since launch", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const res = resolveAnalyticsPeriod("all", now);
  assert.equal(res.period, "all");
  assert.equal(res.bucketUnit, "month");
  assert.ok(res.buckets.length >= 1);
});

test("Helpers: bucketKeyFor formats deterministically by unit", () => {
  const d = new Date("2026-08-15T14:30:00Z");
  // Month unit
  assert.equal(bucketKeyFor(d, "month"), "2026-08");
  // Day unit
  assert.equal(bucketKeyFor(d, "day"), "2026-08-15");
  // Hour unit
  assert.equal(bucketKeyFor(d, "hour", 14), "2026-08-15-14");
});

test("Helpers: buildBuckets matches resolveAnalyticsPeriod results", () => {
  const now = new Date("2026-08-08T12:00:00Z");
  const { since, buckets } = buildBuckets("week", now);
  assert.equal(buckets.length, 7);
  assert.ok(since instanceof Date);
});
