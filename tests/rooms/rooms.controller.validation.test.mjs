/**
 * Unit coverage for the `.strict()` Zod validation wired into rooms.controller.ts's
 * install/uninstall handlers this pass (they previously did manual `Number.isInteger`
 * checks that silently accepted extra, unexpected body fields — no mass-assignment
 * hardening, unlike auth/'s controllers). These tests exercise the controller
 * functions directly with a fake req/res, mocking `requireSessionUser` so no real
 * session/DB is needed — a pure validation-layer test.
 */
import test from "node:test";
import assert from "node:assert/strict";

const ctrl = await import("../../server/modules/rooms/rooms.controller.ts");

/** Minimal fake Response capturing status/json calls, mirrors Express's chainable API. */
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

function fakeReq(body) {
  return { body, headers: {}, user: { id: 1 } };
}

test("installMiner: rejects a missing rackId with 400 VALIDATION_ERROR", async () => {
  const res = fakeRes();
  await ctrl.installMiner(fakeReq({ inventoryId: 1 }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});

test("installMiner: rejects a non-positive rackId", async () => {
  const res = fakeRes();
  await ctrl.installMiner(fakeReq({ rackId: -1, inventoryId: 1 }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});

test("installMiner: rejects a non-numeric rackId", async () => {
  const res = fakeRes();
  await ctrl.installMiner(fakeReq({ rackId: "'; DROP TABLE users; --", inventoryId: 1 }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});

test("installMiner: rejects an unknown extra body field (mass-assignment hardening, .strict())", async () => {
  const res = fakeRes();
  await ctrl.installMiner(fakeReq({ rackId: 1, inventoryId: 1, isAdmin: true }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});

test("uninstallMiner: rejects a missing rackId", async () => {
  const res = fakeRes();
  await ctrl.uninstallMiner(fakeReq({}), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});

test("uninstallMiner: rejects an unknown extra body field", async () => {
  const res = fakeRes();
  await ctrl.uninstallMiner(fakeReq({ rackId: 1, extra: "field" }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});

test("uninstallMinerBatch: rejects a non-array rackIds", async () => {
  const res = fakeRes();
  await ctrl.uninstallMinerBatch(fakeReq({ rackIds: "1,2,3" }), res);
  assert.equal(res.calls.status, 400);
});

test("uninstallMinerBatch: rejects an empty rackIds array", async () => {
  const res = fakeRes();
  await ctrl.uninstallMinerBatch(fakeReq({ rackIds: [] }), res);
  assert.equal(res.calls.status, 400);
});

test("uninstallMinerBatch: rejects an unknown extra body field", async () => {
  const res = fakeRes();
  await ctrl.uninstallMinerBatch(fakeReq({ rackIds: [1, 2], polBalance: 999999 }), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VALIDATION_ERROR");
});
