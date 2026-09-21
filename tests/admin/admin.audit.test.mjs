import test from "node:test";
import assert from "node:assert/strict";
import { serializeAuditRow, sanitizeAuditPayload } from "../../server/modules/admin/admin.audit-log.service.js";

test("serializeAuditRow converts BigInt id to string safely", () => {
  const row = {
    id: BigInt("9007199254740993"), // larger than Number.MAX_SAFE_INTEGER
    adminId: 2,
    action: "ADMIN_LOGIN_SUCCESS",
    success: true,
  };

  const serialized = serializeAuditRow(row);
  assert.equal(typeof serialized.id, "string");
  assert.equal(serialized.id, "9007199254740993");
  assert.equal(serialized.adminId, 2);
  assert.equal(serialized.action, "ADMIN_LOGIN_SUCCESS");
});

test("serializeAuditRow preserves other fields and properties", () => {
  const row = {
    id: 123n,
    adminId: 1,
    adminEmail: "fraga@blockminer.space",
    action: "ADMIN_UPDATE",
    module: "admins",
    oldValue: { name: "Fraga", role: "admin" },
    newValue: { name: "Fraga", role: "super_admin" },
    success: true,
    errorMsg: null,
    durationMs: 42,
  };

  const serialized = serializeAuditRow(row);
  assert.equal(serialized.id, "123");
  assert.equal(serialized.adminEmail, "fraga@blockminer.space");
  assert.deepEqual(serialized.oldValue, { name: "Fraga", role: "admin" });
  assert.deepEqual(serialized.newValue, { name: "Fraga", role: "super_admin" });
  assert.equal(serialized.durationMs, 42);
});

test("sanitizeAuditPayload redacts sensitive keys at any depth", () => {
  const dirty = {
    name: "Admin User",
    email: "admin@blockminer.com",
    password: "SuperSecretPassword123!",
    passwordHash: "$2b$12$somehashhere",
    nested: {
      apiKey: "ok",
      token: "secret_token_abc",
      jwt: "header.payload.signature",
      privateKey: "0x1234567890abcdef",
      mnemonic: "apple banana cherry dog elephant fox",
    },
    safeArray: [{ count: 5 }, { password: "hidden" }],
  };

  const clean = sanitizeAuditPayload(dirty);
  assert.equal(clean.name, "Admin User");
  assert.equal(clean.email, "admin@blockminer.com");
  assert.equal(clean.password, "[REDACTED]");
  assert.equal(clean.passwordHash, "[REDACTED]");
  assert.equal(clean.nested.apiKey, "ok");
  assert.equal(clean.nested.token, "[REDACTED]");
  assert.equal(clean.nested.jwt, "[REDACTED]");
  assert.equal(clean.nested.privateKey, "[REDACTED]");
  assert.equal(clean.nested.mnemonic, "[REDACTED]");
  assert.equal(clean.safeArray[0].count, 5);
  assert.equal(clean.safeArray[1].password, "[REDACTED]");
});

test("sanitizeAuditPayload returns primitives as-is", () => {
  assert.equal(sanitizeAuditPayload(null), null);
  assert.equal(sanitizeAuditPayload(undefined), undefined);
  assert.equal(sanitizeAuditPayload("test"), "test");
  assert.equal(sanitizeAuditPayload(123), 123);
  assert.equal(sanitizeAuditPayload(true), true);
});
