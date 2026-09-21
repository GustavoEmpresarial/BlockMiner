import test from "node:test";
import assert from "node:assert/strict";
import { serializeAuditRow } from "../../server/modules/admin/admin.audit-log.service.js";

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
