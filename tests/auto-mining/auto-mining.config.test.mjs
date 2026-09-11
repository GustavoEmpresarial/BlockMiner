import test from "node:test";
import assert from "node:assert/strict";

const {
  V1_DAILY_LIMIT,
  V1_CLAIM_COST_SECONDS,
  V2_NORMAL_HASH_PER_CYCLE,
  V2_TURBO_HASH_PER_CYCLE,
  V2_CYCLE_SECONDS,
  V2_DAILY_LIMIT_HASH,
  V2_GRANT_TTL_MS,
  V2_CLICK_GRACE_MS,
  V2_MIN_CLICK_DELAY_MS,
  V2_HEARTBEAT_STALE_MS,
  V2_CLAIM_REQUIRED_SECONDS,
  V2_CLAIM_SECONDS_COST,
  V2_NEGATIVE_CACHE_MS,
} = await import("../../server/modules/auto-mining/auto-mining.config.ts");

test("V1_DAILY_LIMIT — equals 24", () => assert.equal(V1_DAILY_LIMIT, 24));
test("V1_CLAIM_COST_SECONDS — equals 300", () => assert.equal(V1_CLAIM_COST_SECONDS, 300));
test("V2_NORMAL_HASH_PER_CYCLE — equals 10", () => assert.equal(V2_NORMAL_HASH_PER_CYCLE, 10));
test("V2_CYCLE_SECONDS — equals 60", () => assert.equal(V2_CYCLE_SECONDS, 60));
test("V2_DAILY_LIMIT_HASH — equals 1000", () => assert.equal(V2_DAILY_LIMIT_HASH, 1000));
test("V2_GRANT_TTL_MS — eq 24h", () => assert.equal(V2_GRANT_TTL_MS, 86400000));
test("V2_CLICK_GRACE_MS — eq 3min", () => assert.equal(V2_CLICK_GRACE_MS, 180000));
test("V2_MIN_CLICK_DELAY_MS — eq 400ms", () => assert.equal(V2_MIN_CLICK_DELAY_MS, 400));
test("V2_HEARTBEAT_STALE_MS — eq 40s", () => assert.equal(V2_HEARTBEAT_STALE_MS, 40000));
test("V2_CLAIM_REQUIRED_SECONDS — equals 45", () => assert.equal(V2_CLAIM_REQUIRED_SECONDS, 45));
test("V2_CLAIM_SECONDS_COST — equals V2_CLAIM_REQUIRED_SECONDS", () => assert.equal(V2_CLAIM_SECONDS_COST, V2_CLAIM_REQUIRED_SECONDS));
test("V2_NEGATIVE_CACHE_MS — eq 45s", () => assert.equal(V2_NEGATIVE_CACHE_MS, 45000));
test("V2_HEARTBEAT_STALE_MS > 10s heartbeat interval", () => assert.ok(V2_HEARTBEAT_STALE_MS > 10000));
test("V2_CLAIM_REQUIRED_SECONDS < V2_CYCLE_SECONDS", () => assert.ok(V2_CLAIM_REQUIRED_SECONDS < V2_CYCLE_SECONDS));
