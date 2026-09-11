import test from "node:test";
import assert from "node:assert/strict";

// Unit tests for securityLogger.ts (RECOVERED/@ts-nocheck, zero prior coverage) — thin
// wrapper, but must never leak the wrong log level or drop the eventType/fields shape.
const { Logger } = await import("../../server/core/logger/logger.ts");
const { logSecurityEvent, logSecurityWarn } = await import("../../server/shared/security/securityLogger.ts");

// securityLogger.ts captures `logger.child("Security")` once at module-load time into its
// own module-level `base` — a distinct Logger instance from any child() we'd create fresh in
// this test file. The only seam that reaches it is the shared Logger.prototype.

test("logSecurityEvent calls .security(eventType, {eventType, ...fields}, req) on the 'Security' child logger", () => {
  const calls = [];
  const original = Logger.prototype.security;
  Logger.prototype.security = function patched(...args) {
    calls.push({ category: this.category, args });
  };
  try {
    const req = { id: "req-1" };
    logSecurityEvent("AUTH_LOGIN_SUCCESS", { userId: 42 }, req);
    assert.equal(calls.length, 1);
    assert.match(calls[0].category, /Security$/);
    const [eventType, fields, passedReq] = calls[0].args;
    assert.equal(eventType, "AUTH_LOGIN_SUCCESS");
    assert.deepEqual(fields, { eventType: "AUTH_LOGIN_SUCCESS", userId: 42 });
    assert.equal(passedReq, req);
  } finally {
    Logger.prototype.security = original;
  }
});

test("logSecurityEvent defaults fields to {} when omitted", () => {
  const calls = [];
  const original = Logger.prototype.security;
  Logger.prototype.security = function patched(...args) {
    calls.push(args);
  };
  try {
    logSecurityEvent("SOME_EVENT");
    assert.deepEqual(calls[0][1], { eventType: "SOME_EVENT" });
  } finally {
    Logger.prototype.security = original;
  }
});

test("logSecurityWarn calls .warn(...) on the 'Security' child logger, never .security(...)", () => {
  const securityCalls = [];
  const warnCalls = [];
  const origSecurity = Logger.prototype.security;
  const origWarn = Logger.prototype.warn;
  Logger.prototype.security = function patched(...args) {
    securityCalls.push(args);
  };
  Logger.prototype.warn = function patched(...args) {
    warnCalls.push({ category: this.category, args });
  };
  try {
    logSecurityWarn("AUTH_VPN_PROXY_DENIED", { reason: "provider:VPN" });
    assert.equal(securityCalls.length, 0, "must never call the .security level");
    assert.equal(warnCalls.length, 1);
    assert.match(warnCalls[0].category, /Security$/);
    assert.equal(warnCalls[0].args[0], "AUTH_VPN_PROXY_DENIED");
    assert.deepEqual(warnCalls[0].args[1], { eventType: "AUTH_VPN_PROXY_DENIED", reason: "provider:VPN" });
  } finally {
    Logger.prototype.security = origSecurity;
    Logger.prototype.warn = origWarn;
  }
});
