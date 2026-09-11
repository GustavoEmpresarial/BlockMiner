import test from "node:test";
import assert from "node:assert/strict";

const ctrl = await import("../../server/modules/public-stats/public-stats.controller.ts");

test("maskUsername: keeps first 2 chars + '***' for normal names", () => {
  assert.equal(ctrl.maskUsername("gustavo"), "gu***");
  assert.equal(ctrl.maskUsername("ab"), "ab***");
});

test("maskUsername: falls back to 'user' + '***' when null/undefined", () => {
  assert.equal(ctrl.maskUsername(null), "us***");
  assert.equal(ctrl.maskUsername(undefined), "us***");
});

test("maskUsername: single-char name still gets '***' appended (len<=2 branch)", () => {
  assert.equal(ctrl.maskUsername("a"), "a***");
  // Empty string is not null/undefined, so it does NOT fall back to "user" — matches legacy's
  // `const s = name ?? "user"` (nullish coalescing only, not falsy-coalescing).
  assert.equal(ctrl.maskUsername(""), "***");
});

test("decimalToNumber: handles number/bigint/Prisma Decimal-like/null", () => {
  assert.equal(ctrl.decimalToNumber(null), 0);
  assert.equal(ctrl.decimalToNumber(undefined), 0);
  assert.equal(ctrl.decimalToNumber(5), 5);
  assert.equal(ctrl.decimalToNumber(10n), 10);
  assert.equal(ctrl.decimalToNumber({ toString: () => "12.5" }), 12.5);
  assert.equal(ctrl.decimalToNumber("not-a-number"), 0);
});

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

test("getPublicStats: never throws / never 500s even when unreachable (best-effort contract, live DB)", async () => {
  // This exercises the real Promise.allSettled path against the dev DB (see .env DATABASE_URL).
  // We only assert the *shape* of the best-effort contract: ok:true, numeric fields, no 500.
  const res = fakeRes();
  await ctrl.getPublicStats({}, res);
  assert.equal(res.calls.status, null, "must never call res.status() (no 500) on the happy path");
  assert.equal(res.calls.json.ok, true);
  assert.equal(typeof res.calls.json.users, "number");
  assert.equal(typeof res.calls.json.totalWithdrawn, "number");
  assert.equal(typeof res.calls.json.activeMiners, "number");
  assert.equal(res.calls.json.launchDate, "2026-03-05T00:00:00.000Z");
});

test("getPublicFeed: always responds ok:true with array shape, never throws (live DB)", async () => {
  const res = fakeRes();
  await ctrl.getPublicFeed({}, res);
  assert.equal(res.calls.status, null);
  assert.equal(res.calls.json.ok, true);
  assert.ok(Array.isArray(res.calls.json.withdrawals));
  assert.ok(Array.isArray(res.calls.json.deposits));
});
