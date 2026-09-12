/**
 * Architecture/security regression guard for the power-stats surface (stats, boosts,
 * public-stats routes). Turns the manual audit from the 2026-09-12 pass into a test
 * that fails loudly if someone removes auth or rate-limiting from a route later —
 * exactly the kind of gap that audit found twice (public-stats, then boosts) without
 * ever having a test that would have caught either the first time.
 *
 * Approach: introspect the real Express Router's `.stack` rather than re-implementing
 * route logic — every authenticated route must have exactly 3 middleware layers
 * (requireAuth, a rate limiter, the controller), every public route exactly 2
 * (a rate limiter, the controller). The rate limiter itself is an anonymous closure
 * (createRateLimiter's return value), so it's checked by position/count, and
 * requireAuth is checked by name since Express preserves named function.name.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { statsRouter } = await import("../../server/modules/stats/stats.routes.ts");
const { boostsRouter } = await import("../../server/modules/boosts/boosts.routes.ts");
const { publicStatsRouter } = await import("../../server/modules/public-stats/public-stats.routes.ts");

function routeStack(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} not found on this router`);
  return layer.route.stack.map((s) => s.name);
}

describe("stats.routes.ts — every route requires auth + rate limiting", () => {
  it("GET /power has requireAuth + a rate limiter before the controller", () => {
    const names = routeStack(statsRouter, "/power");
    assert.equal(names.length, 3, `expected 3 middleware layers, got: ${names.join(", ")}`);
    assert.equal(names[0], "requireAuth");
  });

  it("GET /earnings has requireAuth + a rate limiter before the controller", () => {
    const names = routeStack(statsRouter, "/earnings");
    assert.equal(names.length, 3, `expected 3 middleware layers, got: ${names.join(", ")}`);
    assert.equal(names[0], "requireAuth");
  });
});

describe("boosts.routes.ts — every route requires auth + rate limiting (money-moving surface)", () => {
  it("GET /status has requireAuth + a rate limiter before the controller", () => {
    const names = routeStack(boostsRouter, "/status");
    assert.equal(names.length, 3, `expected 3 middleware layers, got: ${names.join(", ")}`);
    assert.equal(names[0], "requireAuth");
  });

  it("POST /activate (debits real balance) has requireAuth + a rate limiter before the controller", () => {
    const names = routeStack(boostsRouter, "/activate");
    assert.equal(names.length, 3, `expected 3 middleware layers, got: ${names.join(", ")}`);
    assert.equal(names[0], "requireAuth");
  });
});

describe("public-stats.routes.ts — every public (unauthenticated) route still has rate limiting", () => {
  for (const path of ["/public-stats", "/public-feed", "/live-server-stats"]) {
    it(`GET ${path} has a rate limiter before the controller`, () => {
      const names = routeStack(publicStatsRouter, path);
      assert.equal(names.length, 2, `expected 2 middleware layers (limiter + controller), got: ${names.join(", ")}`);
    });
  }
});
