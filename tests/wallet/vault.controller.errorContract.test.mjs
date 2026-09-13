/**
 * Client/server API-contract regression guard for /vault error codes.
 *
 * Found 2026-09-13: every 400 from vault.service.ts (INVALID_RACK_REF,
 * INVALID_SELECTION, INVALID_VAULT_ITEM, INVALID_SLOT) used to collapse into one
 * generic `{ code: "INVALID_STATE" }` on the wire, while the client's i18n
 * catalogs had translations for codes the server never actually sent (stale
 * leftovers from the legacy vault implementation) and no translation at all
 * for the one code it did send. This test locks in the real, specific codes
 * the client now relies on (see client/src/i18n/locales/*.json vault.errors
 * and docs/vault-cofre-de-mineradores.md#api-contract) so a future change
 * can't silently collapse them back into a generic code without a test
 * failing here first.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { respondVaultError } = await import("../../server/modules/wallet/vault/vault.controller.ts");
const { HttpStatusError } = await import("../../server/shared/errors/httpStatusError.ts");

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

const CASES = [
  { message: "INVALID_RACK_REF", expectedCode: "VAULT_INVALID_RACK_REF" },
  { message: "INVALID_SELECTION", expectedCode: "VAULT_INVALID_SELECTION" },
  { message: "INVALID_VAULT_ITEM", expectedCode: "VAULT_INVALID_VAULT_ITEM" },
  { message: "INVALID_SLOT", expectedCode: "VAULT_INVALID_SLOT" },
];

for (const { message, expectedCode } of CASES) {
  test(`respondVaultError maps HttpStatusError(400, "${message}") to code "${expectedCode}" (not a generic collapse)`, () => {
    const res = fakeRes();
    const err = new HttpStatusError(400, message);
    respondVaultError(res, err, {}, "move", {});
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, expectedCode);
    assert.equal(res.calls.json.ok, false);
  });
}

test("an unrecognized 400 reason falls back to a generic VAULT_INVALID_STATE code, not a crash", () => {
  const res = fakeRes();
  const err = new HttpStatusError(400, "SOME_FUTURE_REASON_NOT_YET_MAPPED");
  respondVaultError(res, err, {}, "move", {});
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "VAULT_INVALID_STATE");
});

test("a 404 (NOT_FOUND) still maps to VAULT_NOT_FOUND", () => {
  const res = fakeRes();
  const err = new HttpStatusError(404, "NOT_FOUND");
  respondVaultError(res, err, {}, "retrieve", {});
  assert.equal(res.calls.status, 404);
  assert.equal(res.calls.json.code, "VAULT_NOT_FOUND");
});

test("an unexpected error (e.g. a raw DB error) still falls back to VAULT_UNAVAILABLE with a 500", () => {
  const res = fakeRes();
  const err = new Error("connection reset");
  respondVaultError(res, err, {}, "move", {});
  assert.equal(res.calls.status, 500);
  assert.equal(res.calls.json.code, "VAULT_UNAVAILABLE");
});
