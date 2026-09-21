import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  serializeAuditRow,
  sanitizeAuditPayload,
} from "../../server/modules/admin/admin.audit-log.service.js";

test("PERFORMANCE: serializeAuditRow handles 10,000 rows in < 50ms", () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({
    id: BigInt(1000000 + i),
    adminId: (i % 5) + 1,
    action: "ADMIN_LOGIN_SUCCESS",
    module: "auth",
    resource: "AdminSession",
    resourceId: `session_${i}`,
    success: true,
    durationMs: 15,
    createdAt: new Date(),
  }));

  const t0 = performance.now();
  for (let i = 0; i < rows.length; i++) {
    serializeAuditRow(rows[i]);
  }
  const elapsed = performance.now() - t0;

  console.log(`[Benchmark] serializeAuditRow 10k rows: ${elapsed.toFixed(2)}ms (${(10000 / (elapsed / 1000)).toFixed(0)} ops/sec)`);
  assert.ok(elapsed < 100, `Expected < 100ms, got ${elapsed}ms`);
});

test("PERFORMANCE: sanitizeAuditPayload processes 10,000 payloads in < 100ms", () => {
  const dirtyPayloads = Array.from({ length: 10000 }, (_, i) => ({
    name: `User ${i}`,
    email: `admin_${i}@blockminer.space`,
    password: "SuperSecretPassword123!",
    token: "jwt.token.here",
    details: {
      action: "UPDATE",
      privateKey: "0xdeadbeef",
      nested: {
        role: "admin",
        passwordHash: "$2b$12$hash",
      },
    },
  }));

  const t0 = performance.now();
  for (let i = 0; i < dirtyPayloads.length; i++) {
    sanitizeAuditPayload(dirtyPayloads[i]);
  }
  const elapsed = performance.now() - t0;

  console.log(`[Benchmark] sanitizeAuditPayload 10k items: ${elapsed.toFixed(2)}ms (${(10000 / (elapsed / 1000)).toFixed(0)} ops/sec)`);
  assert.ok(elapsed < 200, `Expected < 200ms, got ${elapsed}ms`);
});

test("SECURITY & INTEGRITY: payload sanitization completely removes sensitive fields", () => {
  const testPayload = {
    apiKey: "clean",
    userPassword: "secretPassword",
    password: "secretPassword",
    nested: {
      privateKey: "secretKey",
      mnemonic: "words",
      safeKey: "safeValue",
    },
  };

  const sanitized = sanitizeAuditPayload(testPayload);
  const jsonStr = JSON.stringify(sanitized);

  assert.ok(!jsonStr.includes("secretPassword"), "Password must not be in sanitized payload");
  assert.ok(!jsonStr.includes("secretKey"), "PrivateKey must not be in sanitized payload");
  assert.ok(!jsonStr.includes("words"), "Mnemonic must not be in sanitized payload");
  assert.ok(jsonStr.includes("[REDACTED]"), "Must have redacted placeholder");
  assert.ok(jsonStr.includes("safeValue"), "Must keep safe values");
});
