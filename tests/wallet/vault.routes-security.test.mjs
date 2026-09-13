/**
 * Architecture/security regression guard for the /vault surface (Cofre de
 * Mineradores) — same approach as tests/inventory/inventory-rooms.routes-security.test.mjs
 * and tests/stats/power-stats.routes-security.test.mjs: introspect the real
 * Express Router's `.stack` so a future PR that drops auth, idempotency, or
 * rate-limiting on a vault mutation fails a test instead of shipping quietly.
 * Both vault mutations move a real owned machine (an asset) between the
 * vault and rack/inventory, same risk class as rooms' install/uninstall.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { vaultRouter } = await import("../../server/modules/wallet/vault/vault.routes.ts");

function routeStack(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} not found on this router`);
  return layer.route.stack.map((s) => s.name);
}

function routerWideMiddlewareNames(router) {
  return router.stack.filter((l) => !l.route).map((l) => l.name);
}

describe("vault.routes.ts — the /vault surface", () => {
  it("requireAuth is applied router-wide (every route below it is authenticated)", () => {
    const names = routerWideMiddlewareNames(vaultRouter);
    assert.ok(names.includes("requireAuth"), `expected requireAuth as router-level middleware, got: ${names.join(", ")}`);
  });

  it("only exposes the three real routes — GET /, POST /move-to-vault, POST /retrieve-from-vault", () => {
    const paths = vaultRouter.stack.filter((l) => l.route).map((l) => l.route.path);
    assert.deepEqual(paths.sort(), ["/", "/move-to-vault", "/retrieve-from-vault"].sort());
  });

  // Assert on the handler NAMES, not just the count: a PR that swaps
  // requireCriticalIdempotency for something else, or replaces the rate limiter with a
  // no-op, keeps the arity at 4 and would sail past a length-only check — exactly the
  // regression this file exists to catch.
  for (const path of ["/move-to-vault", "/retrieve-from-vault"]) {
    it(`POST ${path} has the rate limiter, body validation and idempotency guard (by name) before the controller`, () => {
      const names = routeStack(vaultRouter, path);
      assert.equal(names.length, 4, `expected rateLimiter + validateBody + idempotency + controller, got: ${names.join(", ")}`);
      // validateBody() returns an anonymous closure, so it can only be pinned by position
      // (slot 1); the other two guards are named functions and are asserted by name.
      assert.equal(
        names[0],
        "distributedRateLimiter",
        `expected the distributed rate limiter first on ${path}, got: ${names.join(", ")}`,
      );
      assert.equal(names[1], "<anonymous>", `expected validateBody's closure second on ${path}, got: ${names.join(", ")}`);
      assert.equal(
        names[2],
        "criticalIdempotency",
        `expected the critical-idempotency guard third on ${path}, got: ${names.join(", ")}`,
      );
    });
  }

  it("GET / (list) has no extra guards beyond the router-wide requireAuth — read-only, no rate limiter needed", () => {
    const names = routeStack(vaultRouter, "/");
    assert.equal(names.length, 1, `expected just the controller (requireAuth is router-wide), got: ${names.join(", ")}`);
  });
});

describe("vault write endpoints are not exempt from CSRF protection", () => {
  it("/api/vault is not in the CSRF-exempt prefix list", async () => {
    const csrfSource = await import("../../server/core/http/middleware/csrf.ts");
    // CSRF_EXEMPT_PREFIXES isn't exported, so exercise the real middleware directly
    // instead of reaching into its internals — a POST with no token must be rejected.
    const middleware = csrfSource.createCsrfMiddleware();
    const req = { method: "POST", url: "/api/vault/retrieve-from-vault", originalUrl: "/api/vault/retrieve-from-vault", headers: {} };
    const calls = { status: null, json: null };
    const res = {
      locals: {},
      status(code) {
        calls.status = code;
        return this;
      },
      json(body) {
        calls.json = body;
        return this;
      },
      getHeader() {
        return undefined;
      },
      setHeader() {},
    };
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false, "a POST to /api/vault/* with no CSRF token must be rejected, not exempted");
    assert.equal(calls.status, 403);
    assert.equal(calls.json.code, "INVALID_CSRF_TOKEN");
  });
});
