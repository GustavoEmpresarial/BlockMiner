import test from "node:test";
import assert from "node:assert/strict";

// isIpAllowed / ZERADS_ALLOWED_IPS are computed at module-load time from env vars,
// so we assert against the actual default (162.0.208.108) rather than mutating env
// mid-test-run (module is already cached by the time we could set env vars).
const { isIpAllowed, ZERADS_ALLOWED_IPS } = await import("../../server/modules/zerads/zerads.service.ts");

test("default allowlist contains the documented Zerads server IP", () => {
  assert.ok(ZERADS_ALLOWED_IPS.has("162.0.208.108"));
});

test("isIpAllowed accepts the allowlisted IP", () => {
  assert.equal(isIpAllowed("162.0.208.108"), true);
});

test("isIpAllowed rejects an arbitrary/unlisted IP", () => {
  assert.equal(isIpAllowed("1.2.3.4"), false);
  assert.equal(isIpAllowed("127.0.0.1"), false);
});
