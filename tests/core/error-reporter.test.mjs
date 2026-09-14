import test from "node:test";
import assert from "node:assert/strict";

const { reportError, redactContext, fingerprintError } = await import("../../server/core/errors/index.ts");
const { Logger } = await import("../../server/core/logger/index.ts");

test("redactContext masks any key that looks like a secret, recursively, without mutating the input", () => {
  const original = {
    userId: 42,
    password: "hunter2",
    passwordHash: "$2b$12$not-a-real-hash",
    nested: { refreshToken: "abc.def.ghi", ok: true },
    Authorization: "Bearer xyz",
  };
  const redacted = redactContext(original);
  assert.equal(redacted.userId, 42);
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.passwordHash, "[REDACTED]");
  assert.equal(redacted.nested.refreshToken, "[REDACTED]");
  assert.equal(redacted.nested.ok, true);
  assert.equal(redacted.Authorization, "[REDACTED]");
  assert.equal(original.password, "hunter2", "must not mutate the caller's object");
});

test("redactContext handles undefined/empty context without throwing", () => {
  assert.deepEqual(redactContext(undefined), {});
  assert.deepEqual(redactContext({}), {});
});

test("fingerprintError is stable for the same (module, category, code) and differs otherwise", () => {
  const a = fingerprintError({ code: "LOGIN_FAILED", category: "AUTH", module: "auth.login" });
  const b = fingerprintError({ code: "LOGIN_FAILED", category: "AUTH", module: "auth.login" });
  const c = fingerprintError({ code: "LOGIN_FAILED", category: "AUTH", module: "auth.register" });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^fp_[0-9a-f]{10}$/);
});

test("reportError never throws even with a non-Error thrown value, and returns a fingerprint", () => {
  const result = reportError({
    code: "SOMETHING_FAILED",
    category: "UNKNOWN",
    severity: "ERROR",
    module: "test.module",
    error: "a plain string throw",
    context: { password: "should-not-leak" },
  });
  assert.match(result.fingerprint, /^fp_/);
});

test("reportError extracts message/stack from a real Error instance and logs at CRITICAL", () => {
  // Logger.prototype is the only seam reachable from outside (writeLine() is a no-op in
  // NODE_ENV=test, same convention used by tests/auth/securityLogger.test.mjs).
  const original = Logger.prototype.error;
  let captured;
  Logger.prototype.error = function patched(message, details) {
    captured = { message, details };
  };
  try {
    reportError({
      code: "DB_TIMEOUT",
      category: "DATABASE",
      severity: "CRITICAL",
      module: "wallet.withdrawal",
      error: new Error("connection timed out"),
    });
  } finally {
    Logger.prototype.error = original;
  }
  assert.ok(captured, "expected the logger to be called");
  assert.equal(captured.message, "DB_TIMEOUT");
  assert.equal(captured.details.error_message, "connection timed out");
  assert.ok(captured.details.stack, "CRITICAL severity must keep the stack trace");
  assert.equal(captured.details.severity, "CRITICAL");
  assert.equal(captured.details.category, "DATABASE");
});

test("reportError omits the stack trace for WARNING severity (keeps noise down) and routes to warn()", () => {
  const original = Logger.prototype.warn;
  let captured;
  Logger.prototype.warn = function patched(message, details) {
    captured = { message, details };
  };
  try {
    reportError({
      code: "SLOW_EXTERNAL_CALL",
      category: "EXTERNAL_API",
      severity: "WARNING",
      module: "auth.google",
      error: new Error("slow"),
    });
  } finally {
    Logger.prototype.warn = original;
  }
  assert.ok(captured, "expected the logger to be called");
  assert.equal(captured.details.stack, undefined);
});

test("reportError never leaks secret-looking context fields into the log line", () => {
  const original = Logger.prototype.error;
  let captured;
  Logger.prototype.error = function patched(message, details) {
    captured = details;
  };
  try {
    reportError({
      code: "LOGIN_UNEXPECTED",
      category: "AUTH",
      severity: "ERROR",
      module: "auth.login",
      error: new Error("boom"),
      context: { userId: 7, refreshToken: "leak-me-not" },
    });
  } finally {
    Logger.prototype.error = original;
  }
  assert.equal(captured.context.userId, 7);
  assert.equal(captured.context.refreshToken, "[REDACTED]");
});
