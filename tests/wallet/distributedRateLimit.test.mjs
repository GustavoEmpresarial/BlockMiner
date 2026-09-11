import test from "node:test";
import assert from "node:assert/strict";

const { createDistributedRateLimiter } = await import("../../server/core/http/middleware/distributedRateLimit.ts");

test("createDistributedRateLimiter returns an Express-compatible middleware function", () => {
  const mw = createDistributedRateLimiter({ windowMs: 60_000, max: 5, name: "unit_test" });
  assert.equal(typeof mw, "function");
  assert.equal(mw.length, 3);
});
