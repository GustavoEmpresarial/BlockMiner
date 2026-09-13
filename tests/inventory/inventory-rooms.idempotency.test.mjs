/**
 * Idempotency-key validation/replay-detection guard for the /rooms and /inventory
 * critical mutations (install, uninstall, buy, remove — all wired through
 * requireCriticalIdempotency in rooms.routes.ts / inventory.routes.js).
 *
 * This covers the synchronous, DB-independent half of the middleware: key
 * normalization/rejection and the stable request-hash used to detect a
 * replayed key reused against a *different* payload (INVALID_REQUEST_SIGNATURE).
 * The DB-backed half (actual lease/replay/busy transaction against Postgres) is
 * already covered live against the dev/staging DB by
 * tests/rooms/rooms.installMiner.integration.test.mjs; that test requires a
 * real database connection this sandbox does not have, so it is not duplicated
 * here — this file only guards the pure logic that runs before any DB call.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { requireCriticalIdempotency } = await import("../../server/core/http/middleware/idempotency.ts");

function fakeRes() {
  const calls = { status: null, json: null };
  return {
    calls,
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

function run(mw, req) {
  const res = fakeRes();
  let nextCalled = false;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test("rejects a mutation request with no Idempotency-Key at all (prevents accidental double-execution)", () => {
  const mw = requireCriticalIdempotency({ scope: "rooms_rack_install" });
  const req = { get: () => undefined, body: { rackId: 1 }, params: {}, path: "/api/rooms/rack/install" };
  const { res, nextCalled } = run(mw, req);
  assert.equal(nextCalled, false);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "INVALID_STATE");
});

test("rejects an Idempotency-Key that is too short, too long, or has invalid characters", () => {
  const mw = requireCriticalIdempotency({ scope: "inventory_install" });
  for (const bad of ["short", "x".repeat(129), "has spaces here!!", ""]) {
    const req = { get: (h) => (h === "Idempotency-Key" ? bad : undefined), body: {}, params: {}, path: "/api/inventory/install" };
    const { res, nextCalled } = run(mw, req);
    assert.equal(nextCalled, false, `key ${JSON.stringify(bad)} should have been rejected`);
    assert.equal(res.calls.status, 400);
  }
});

test("accepts a well-formed Idempotency-Key and attaches scope/key/requestHash to the request for the controller", () => {
  const mw = requireCriticalIdempotency({ scope: "rooms_rack_uninstall" });
  const req = {
    get: (h) => (h === "Idempotency-Key" ? "abc12345-def-456" : undefined),
    body: { rackId: 7 },
    params: { id: "7" },
    path: "/api/rooms/rack/uninstall",
  };
  const { nextCalled } = run(mw, req);
  assert.equal(nextCalled, true);
  assert.equal(req.criticalIdempotency.scope, "rooms_rack_uninstall");
  assert.equal(req.criticalIdempotency.idempotencyKey, "abc12345-def-456");
  assert.match(req.criticalIdempotency.requestHash, /^[0-9a-f]{64}$/);
});

test("the request hash is deterministic for the same logical payload regardless of key order (replay detection is stable)", () => {
  const mw = requireCriticalIdempotency({ scope: "inventory_remove" });
  const key = "same-key-0123456789";
  const reqA = {
    get: () => key,
    body: { itemId: 5, slot: 2 },
    params: {},
    path: "/api/inventory/remove",
  };
  const reqB = {
    get: () => key,
    body: { slot: 2, itemId: 5 },
    params: {},
    path: "/api/inventory/remove",
  };
  run(mw, reqA);
  run(mw, reqB);
  assert.equal(
    reqA.criticalIdempotency.requestHash,
    reqB.criticalIdempotency.requestHash,
    "field order in the body must not change the hash — otherwise equivalent replays would be wrongly treated as new requests",
  );
});

test("the request hash changes when the payload actually differs, so a reused key against a different payload is detectable as a mismatch upstream", () => {
  const mw = requireCriticalIdempotency({ scope: "rooms_rack_install" });
  const key = "same-key-0123456789";
  const reqBuyOne = { get: () => key, body: { rackId: 1, slot: 1 }, params: {}, path: "/api/rooms/rack/install" };
  const reqBuyOther = { get: () => key, body: { rackId: 2, slot: 1 }, params: {}, path: "/api/rooms/rack/install" };
  run(mw, reqBuyOne);
  run(mw, reqBuyOther);
  assert.notEqual(
    reqBuyOne.criticalIdempotency.requestHash,
    reqBuyOther.criticalIdempotency.requestHash,
    "reusing the same idempotency key for a genuinely different mutation must produce a different hash, so resolveCriticalMutation can reject it as INVALID_REQUEST_SIGNATURE instead of silently replaying the wrong result",
  );
});

test("an ephemeral field (cfTurnstileToken) is stripped from the hash so its rotation does not break legitimate replays", () => {
  const mw = requireCriticalIdempotency({ scope: "inventory_install" });
  const key = "same-key-0123456789";
  const req1 = { get: () => key, body: { itemId: 1, cfTurnstileToken: "token-A" }, params: {}, path: "/api/inventory/install" };
  const req2 = { get: () => key, body: { itemId: 1, cfTurnstileToken: "token-B" }, params: {}, path: "/api/inventory/install" };
  run(mw, req1);
  run(mw, req2);
  assert.equal(req1.criticalIdempotency.requestHash, req2.criticalIdempotency.requestHash);
});
