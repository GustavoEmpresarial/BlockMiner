/**
 * Architecture/security regression guard for POST /energy-tax/pay-daily —
 * same stack-introspection approach as tests/wallet/vault.routes-security.test.mjs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { energyTaxRouter } = await import("../../server/modules/energy-tax/energy-tax.routes.ts");

function routeStack(router, path) {
  const layer = router.stack.find((l) => l.route?.path === path);
  assert.ok(layer, `route ${path} not found on this router`);
  return layer.route.stack.map((s) => s.name);
}

describe("energy-tax.routes.ts — pay-daily surface", () => {
  it("POST /pay-daily has requireAuth, rate limiter, critical idempotency, then the controller", () => {
    const names = routeStack(energyTaxRouter, "/pay-daily");
    assert.equal(
      names.length,
      4,
      `expected requireAuth + limiter + idempotency + controller, got: ${names.join(", ")}`,
    );
    assert.equal(names[0], "requireAuth", `expected requireAuth first, got: ${names.join(", ")}`);
    assert.equal(names[2], "criticalIdempotency", `expected criticalIdempotency third, got: ${names.join(", ")}`);
    assert.equal(names[3], "postPayDaily", `expected postPayDaily last, got: ${names.join(", ")}`);
  });
});
