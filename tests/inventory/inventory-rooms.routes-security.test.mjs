/**
 * Architecture/security regression guard for the /inventory surface — the actual
 * live routes behind it (server/modules/inventory for the read side, server/modules/
 * rooms for the real install/uninstall mutations the client calls). Same approach as
 * tests/stats/power-stats.routes-security.test.mjs: introspect the real Express
 * Router's `.stack` so a future PR that drops auth, idempotency, or rate-limiting
 * fails a test instead of shipping quietly.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { inventoryRouter } = await import("../../server/modules/inventory/inventory.routes.ts");
const { roomsRouter } = await import("../../server/modules/rooms/rooms.routes.ts");

function routeStack(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} not found on this router`);
  return layer.route.stack.map((s) => s.name);
}

function routerWideMiddlewareNames(router) {
  return router.stack.filter((l) => !l.route).map((l) => l.name);
}

describe("inventory.routes.ts — the live GET / (list) route requires auth", () => {
  it("GET / has requireAuth before the controller", () => {
    const names = routeStack(inventoryRouter, "/");
    assert.equal(names.length, 2, `expected requireAuth + controller, got: ${names.join(", ")}`);
    assert.equal(names[0], "requireAuth");
  });

  it("only exposes GET / — the dead POST /install, /remove, /update were removed, not left reachable", () => {
    const paths = inventoryRouter.stack.filter((l) => l.route).map((l) => l.route.path);
    assert.deepEqual(paths, ["/"]);
  });
});

describe("rooms.routes.ts — the real install/uninstall flow behind /inventory", () => {
  it("requireAuth is applied router-wide (every route below it is authenticated)", () => {
    const names = routerWideMiddlewareNames(roomsRouter);
    assert.ok(names.includes("requireAuth"), `expected requireAuth as router-level middleware, got: ${names.join(", ")}`);
  });

  it("POST /rack/install has a rate limiter + idempotency guard before the controller", () => {
    const names = routeStack(roomsRouter, "/rack/install");
    assert.equal(names.length, 3, `expected rateLimiter + idempotency + controller, got: ${names.join(", ")}`);
  });

  it("POST /rack/uninstall has a rate limiter + idempotency guard before the controller", () => {
    const names = routeStack(roomsRouter, "/rack/uninstall");
    assert.equal(names.length, 3, `expected rateLimiter + idempotency + controller, got: ${names.join(", ")}`);
  });

  it("POST /rack/uninstall-batch has a rate limiter + idempotency guard before the controller", () => {
    const names = routeStack(roomsRouter, "/rack/uninstall-batch");
    assert.equal(names.length, 3, `expected rateLimiter + idempotency + controller, got: ${names.join(", ")}`);
  });

  it("POST /buy (spends real currency) has a rate limiter before the controller", () => {
    const names = routeStack(roomsRouter, "/buy");
    assert.equal(names.length, 2, `expected rateLimiter + controller, got: ${names.join(", ")}`);
  });
});
