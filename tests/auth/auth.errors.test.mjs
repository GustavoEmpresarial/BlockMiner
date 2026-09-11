import test from "node:test";
import assert from "node:assert/strict";

const { buildAuthFailureJson, AUTH_LOGIN_MESSAGES } = await import("../../server/modules/auth/auth.errors.ts");

test("buildAuthFailureJson has the { ok:false, code, message, error } contract", () => {
  const body = buildAuthFailureJson("INVALID_CREDENTIALS", AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS);
  assert.equal(body.ok, false);
  assert.equal(body.code, "INVALID_CREDENTIALS");
  assert.equal(body.message, AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS);
  assert.equal(body.error, AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS);
});

test("buildAuthFailureJson merges extra fields", () => {
  const body = buildAuthFailureJson("TWO_FACTOR_REQUIRED", "msg", { require2FA: true });
  assert.equal(body.require2FA, true);
});

test("VPN_PROXY_BLOCKED has a user-facing Portuguese message", () => {
  assert.match(AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED, /VPN/i);
  const body = buildAuthFailureJson("VPN_PROXY_BLOCKED", AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED);
  assert.equal(body.code, "VPN_PROXY_BLOCKED");
});
