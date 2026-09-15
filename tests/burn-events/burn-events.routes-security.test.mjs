/**
 * Architecture/security regression guard for /api/burn-events.
 * Introspects the live Express Router so a future PR that drops auth, Zod,
 * rate-limiting, or idempotency fails instead of shipping quietly.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { burnEventsRouter } = await import("../../server/modules/burn-events/burn-events.routes.ts");
const { burnEventsAdminRouter } = await import(
  "../../server/modules/burn-events/burn-events.admin.routes.ts"
);

function routeStack(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} not found on this router`);
  return layer.route.stack.map((s) => s.name);
}

function routerWideMiddlewareNames(router) {
  return router.stack.filter((l) => !l.route).map((l) => l.name);
}

describe("burn-events.routes.ts — player surface", () => {
  it("requireAuth is applied router-wide", () => {
    const names = routerWideMiddlewareNames(burnEventsRouter);
    assert.ok(
      names.includes("requireAuth"),
      `expected requireAuth as router-level middleware, got: ${names.join(", ")}`,
    );
  });

  it("GET / has a rate limiter before the controller", () => {
    const names = routeStack(burnEventsRouter, "/");
    assert.ok(names.length >= 2, `expected limiter + controller, got: ${names.join(", ")}`);
  });

  it("POST /:id/start has rate limiter + body validation + idempotency", () => {
    const names = routeStack(burnEventsRouter, "/:id/start");
    assert.ok(names.length >= 4, `expected limiter + validate + idempotency + controller, got: ${names.join(", ")}`);
    assert.ok(
      names.includes("criticalIdempotency"),
      `expected criticalIdempotency on start, got: ${names.join(", ")}`,
    );
  });

  it("POST /:id/claim has rate limiter + body validation + idempotency", () => {
    const names = routeStack(burnEventsRouter, "/:id/claim");
    assert.ok(names.length >= 4, `expected limiter + validate + idempotency + controller, got: ${names.join(", ")}`);
    assert.ok(
      names.includes("criticalIdempotency"),
      `expected criticalIdempotency on claim, got: ${names.join(", ")}`,
    );
  });
});

describe("burn-events.admin.routes.ts — admin surface", () => {
  it("requireAdminAuth is applied router-wide (BFLA: players cannot hit admin writes)", () => {
    const names = routerWideMiddlewareNames(burnEventsAdminRouter);
    assert.ok(
      names.includes("requireAdminAuth"),
      `expected requireAdminAuth as router-level middleware, got: ${names.join(", ")}`,
    );
  });

  it("POST / has a write limiter and body validation before create", () => {
    const postLayer = burnEventsAdminRouter.stack.find((l) => l.route?.path === "/" && l.route.methods.post);
    assert.ok(postLayer, "POST / missing");
    const postNames = postLayer.route.stack.map((s) => s.name);
    assert.ok(postNames.length >= 2, `expected limiter + validate + controller, got: ${postNames.join(", ")}`);
  });
});
