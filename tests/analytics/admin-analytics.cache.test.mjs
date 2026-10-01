import test from "node:test";
import assert from "node:assert/strict";
import {
  getOrCompute,
  clearAnalyticsCache,
  ALLTIME_TTL_MS,
  TTL_MS,
} from "../../server/modules/analytics/analytics.cache.ts";

test.beforeEach(() => {
  clearAnalyticsCache();
});

test("Cache: computes and caches value on first hit", async () => {
  let callCount = 0;
  const compute = async () => {
    callCount++;
    return { data: "sample_value" };
  };

  const val1 = await getOrCompute("test:key", compute, 10_000);
  assert.deepEqual(val1, { data: "sample_value" });
  assert.equal(callCount, 1);

  // Second immediate hit -> returns cached, compute not called
  const val2 = await getOrCompute("test:key", compute, 10_000);
  assert.deepEqual(val2, { data: "sample_value" });
  assert.equal(callCount, 1);
});

test("Cache: deduplicates concurrent in-flight requests", async () => {
  let callCount = 0;
  const compute = async () => {
    callCount++;
    await new Promise((r) => setTimeout(r, 20));
    return { count: callCount };
  };

  const [res1, res2, res3] = await Promise.all([
    getOrCompute("concurrent:key", compute, 10_000),
    getOrCompute("concurrent:key", compute, 10_000),
    getOrCompute("concurrent:key", compute, 10_000),
  ]);

  assert.equal(callCount, 1);
  assert.deepEqual(res1, { count: 1 });
  assert.deepEqual(res2, { count: 1 });
  assert.deepEqual(res3, { count: 1 });
});

test("Cache: stale-while-revalidate serves stale value and triggers background refresh", async () => {
  let callCount = 0;
  const compute = async () => {
    callCount++;
    return { version: callCount };
  };

  // Seed with 10ms TTL
  const v1 = await getOrCompute("swr:key", compute, 10);
  assert.deepEqual(v1, { version: 1 });
  assert.equal(callCount, 1);

  // Wait for TTL to expire
  await new Promise((r) => setTimeout(r, 25));

  // Request should immediately return stale value (v1) and kick off background refresh
  const vStale = await getOrCompute("swr:key", compute, 10);
  assert.deepEqual(vStale, { version: 1 });

  // Wait for background refresh to finish
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(callCount, 2);

  // Next call sees fresh refreshed value (v2)
  const vFresh = await getOrCompute("swr:key", compute, 10_000);
  assert.deepEqual(vFresh, { version: 2 });
});

test("Cache: clearAnalyticsCache purges cached entries", async () => {
  let callCount = 0;
  const compute = async () => {
    callCount++;
    return { val: callCount };
  };

  await getOrCompute("purge:key", compute, 10_000);
  assert.equal(callCount, 1);

  clearAnalyticsCache();

  await getOrCompute("purge:key", compute, 10_000);
  assert.equal(callCount, 2);
});
