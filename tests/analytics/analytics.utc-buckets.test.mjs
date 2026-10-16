import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAnalyticsPeriod, bucketKeyFor } from "../../server/modules/analytics/analytics.helpers.ts";
import { utcWeekStart } from "../../server/modules/tournaments/tournament-window.ts";

test("analytics day buckets are UTC midnights regardless of server TZ", () => {
  const now = new Date("2026-10-10T02:30:00Z");
  const { buckets } = resolveAnalyticsPeriod("week", now);
  assert.equal(buckets.length, 7);
  assert.equal(buckets.at(-1).from.toISOString(), "2026-10-10T00:00:00.000Z");
  assert.equal(buckets[0].from.toISOString(), "2026-10-04T00:00:00.000Z");
  assert.equal(buckets.at(-1).label, "10/10");
});

test("analytics hour buckets and keys use UTC hours", () => {
  const now = new Date("2026-10-10T02:30:00Z");
  const { buckets } = resolveAnalyticsPeriod("day", now);
  assert.equal(buckets.at(-1).hour, 2);
  assert.equal(buckets.at(-1).from.toISOString(), "2026-10-10T02:00:00.000Z");
  assert.equal(bucketKeyFor(new Date("2026-10-10T02:59:00Z"), "hour"), "2026-10-10-02");
  assert.equal(bucketKeyFor(new Date("2026-10-01T00:30:00Z"), "month"), "2026-10");
});

test("analytics month buckets start on day 1 00:00 UTC", () => {
  const { buckets } = resolveAnalyticsPeriod("year", new Date("2026-10-10T02:30:00Z"));
  assert.equal(buckets.at(-1).from.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(buckets.at(-1).to.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("offerwall stats week starts Monday 00:00 UTC", () => {
  // Sunday 2026-10-11 and Saturday 2026-10-10 both belong to the week of Monday 2026-10-05.
  assert.equal(utcWeekStart(new Date("2026-10-11T23:59:00Z")).toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(utcWeekStart(new Date("2026-10-12T00:00:00Z")).toISOString(), "2026-10-12T00:00:00.000Z");
});

test("bucket math is identical when the process runs in America/Sao_Paulo", { skip: process.env.UTC_BUCKET_CHILD === "1" ? "child run" : false }, () => {
  const self = fileURLToPath(import.meta.url);
  const out = execFileSync(process.execPath, ["--import", "tsx", "--test", self], {
    env: { ...process.env, TZ: "America/Sao_Paulo", UTC_BUCKET_CHILD: "1" },
    encoding: "utf8",
  });
  assert.match(out, /# pass 4/);
  assert.match(out, /# fail 0/);
});
