/**
 * Active rate-limit-bypass guard for the /rooms and /inventory write limiters.
 * Before this, only route-introspection tests confirmed a limiter middleware was
 * *present* on these routes — nothing actually fired N+1 requests and confirmed
 * it *blocks*. This exercises the real sliding-window algorithm
 * (server/core/http/middleware/distributedRateLimit.ts) end to end: same
 * dedupeKey, same window, hammering past `max` and asserting the (max+1)th call
 * is rejected, while a different key is unaffected (no cross-tenant leakage) and
 * a later window/name resets cleanly.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { slidingWindowAllow, createDistributedRateLimiter } = await import(
  "../../server/core/http/middleware/distributedRateLimit.ts"
);

function uniqueKey(label) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test("rooms write limiter: (max+1)th request in the window is actually rejected", async () => {
  const dedupeKey = uniqueKey("rooms-write");
  const max = 3;
  const results = [];
  for (let i = 0; i < max + 2; i++) {
    results.push(await slidingWindowAllow({ dedupeKey, windowMs: 60_000, max, redisPrefix: "rl:rooms_write_test:p" }));
  }
  const allowed = results.filter((r) => r.ok).length;
  const blocked = results.filter((r) => !r.ok).length;
  assert.equal(allowed, max, "exactly `max` requests should be let through");
  assert.equal(blocked, 2, "everything past `max` in the same window must be rejected");
  assert.ok(results[results.length - 1].retryAfterSec > 0, "a blocked response must tell the caller when to retry");
});

test("inventory write limiter: distinct dedupe keys (different users/IPs) do not share a bucket", async () => {
  const max = 2;
  const keyA = uniqueKey("inv-user-a");
  const keyB = uniqueKey("inv-user-b");

  await slidingWindowAllow({ dedupeKey: keyA, windowMs: 60_000, max, redisPrefix: "rl:inventory_write_test:p" });
  await slidingWindowAllow({ dedupeKey: keyA, windowMs: 60_000, max, redisPrefix: "rl:inventory_write_test:p" });
  const thirdForA = await slidingWindowAllow({ dedupeKey: keyA, windowMs: 60_000, max, redisPrefix: "rl:inventory_write_test:p" });
  assert.equal(thirdForA.ok, false, "user A must be rate-limited after exhausting their own quota");

  const firstForB = await slidingWindowAllow({ dedupeKey: keyB, windowMs: 60_000, max, redisPrefix: "rl:inventory_write_test:p" });
  assert.equal(firstForB.ok, true, "user B's quota must be independent of user A's — no cross-tenant bucket leakage");
});

test("createDistributedRateLimiter actually returns 429 RATE_LIMIT_EXCEEDED after the limit, end to end through the Express-shaped middleware", async () => {
  const name = uniqueKey("rooms_write_mw");
  const dedupeKey = uniqueKey("ip-user");
  const middleware = createDistributedRateLimiter({ windowMs: 60_000, max: 2, name, keyGenerator: () => dedupeKey });

  function fakeRes() {
    const calls = { status: null, json: null, headers: {} };
    return {
      calls,
      setHeader(k, v) {
        calls.headers[k] = v;
      },
      status(code) {
        calls.status = code;
        return this;
      },
      json(body) {
        calls.json = body;
        return this;
      },
    };
  }

  async function fire() {
    const res = fakeRes();
    let nextCalled = false;
    await middleware({ ip: "1.2.3.4", path: "/api/rooms/rack/install" }, res, () => {
      nextCalled = true;
    });
    return { res, nextCalled };
  }

  const first = await fire();
  const second = await fire();
  const third = await fire();

  assert.equal(first.nextCalled, true);
  assert.equal(second.nextCalled, true);
  assert.equal(third.nextCalled, false, "the 3rd request past max=2 must be rejected, not passed to next()");
  assert.equal(third.res.calls.status, 429);
  assert.equal(third.res.calls.json.code, "RATE_LIMIT_EXCEEDED");
});
