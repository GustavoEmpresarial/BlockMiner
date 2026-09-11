import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBuckets } from "../../server/modules/analytics/analytics.admin.controller.ts";

// GET /api/admin/analytics?period=week|month|year buckets rewardsOverTime (from a Postgres
// date_trunc('day'|'month', created_at) raw query) against this local calendar-bucket list.
// This exercises the bucket-shape math without needing Postgres.

describe("analytics buildBuckets", () => {
  it("week: 7 daily buckets ending today, since = 7 days ago", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const { since, buckets } = buildBuckets("week", now);
    assert.equal(buckets.length, 7);
    assert.equal(since.getUTCDate(), 1);
    assert.equal(buckets[buckets.length - 1].day, 8, "last bucket is today");
    assert.ok(buckets.every((b) => typeof b.label === "string" && b.label.length > 0));
  });

  it("month: 30 daily buckets", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const { buckets } = buildBuckets("month", now);
    assert.equal(buckets.length, 30);
    assert.equal(buckets[buckets.length - 1].day, 8);
  });

  it("year: 12 monthly buckets ending in the current month", () => {
    const now = new Date("2026-08-08T12:00:00Z");
    const { buckets } = buildBuckets("year", now);
    assert.equal(buckets.length, 12);
    assert.equal(buckets[buckets.length - 1].month, 8);
    assert.equal(buckets[buckets.length - 1].year, 2026);
    assert.equal(buckets[0].month, 9);
    assert.equal(buckets[0].year, 2025);
  });
});
