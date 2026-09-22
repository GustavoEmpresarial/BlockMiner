import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAuditLogWhereClause,
  normalizePagination,
} from "../../server/modules/admin/admin.logs.service.js";

test("AuditLog Service: buildAuditLogWhereClause handles empty params", () => {
  const where = buildAuditLogWhereClause({});
  assert.deepEqual(where, {});
});

test("AuditLog Service: buildAuditLogWhereClause handles source filter", () => {
  assert.equal(buildAuditLogWhereClause({ source: "all" }).source, undefined);
  assert.equal(buildAuditLogWhereClause({ source: "   " }).source, undefined);
  assert.equal(buildAuditLogWhereClause({ source: "DATABASE" }).source, "database");
  assert.equal(buildAuditLogWhereClause({ source: "user" }).source, "user");
  assert.equal(buildAuditLogWhereClause({ source: "system" }).source, "system");
  assert.equal(buildAuditLogWhereClause({ source: "client" }).source, "client");
});

test("AuditLog Service: buildAuditLogWhereClause handles severity filter", () => {
  assert.equal(buildAuditLogWhereClause({ severity: "all" }).severity, undefined);
  assert.equal(buildAuditLogWhereClause({ severity: "   " }).severity, undefined);
  assert.equal(buildAuditLogWhereClause({ severity: "WARN" }).severity, "warn");
  assert.equal(buildAuditLogWhereClause({ severity: "info" }).severity, "info");
  assert.equal(buildAuditLogWhereClause({ severity: "error" }).severity, "error");
});

test("AuditLog Service: buildAuditLogWhereClause handles action filter with truncation", () => {
  const normal = buildAuditLogWhereClause({ action: "LOGIN_SUCCESS" });
  assert.deepEqual(normal.action, { contains: "LOGIN_SUCCESS", mode: "insensitive" });

  const longAction = "A".repeat(150);
  const truncated = buildAuditLogWhereClause({ action: longAction });
  assert.equal(truncated.action.contains.length, 100);
});

test("AuditLog Service: buildAuditLogWhereClause handles userId sanitization", () => {
  assert.equal(buildAuditLogWhereClause({ userId: 42 }).userId, 42);
  assert.equal(buildAuditLogWhereClause({ userId: "42" }).userId, 42);
  assert.equal(buildAuditLogWhereClause({ userId: 0 }).userId, undefined);
  assert.equal(buildAuditLogWhereClause({ userId: -10 }).userId, undefined);
  assert.equal(buildAuditLogWhereClause({ userId: "abc" }).userId, undefined);
  assert.equal(buildAuditLogWhereClause({ userId: NaN }).userId, undefined);
});

test("AuditLog Service: buildAuditLogWhereClause handles date range filtering", () => {
  const validFrom = "2026-01-01T00:00:00.000Z";
  const validTo = "2026-01-02T00:00:00.000Z";

  const res = buildAuditLogWhereClause({ from: validFrom, to: validTo });
  assert.ok(res.createdAt);
  assert.equal(res.createdAt.gte.toISOString(), validFrom);
  assert.equal(res.createdAt.lte.toISOString(), validTo);

  // Invalid dates should be ignored gracefully
  const invalid = buildAuditLogWhereClause({ from: "invalid-date", to: "not-a-date" });
  assert.equal(invalid.createdAt, undefined);
});

test("AuditLog Service: buildAuditLogWhereClause builds full-text search (q) across 7 fields", () => {
  const where = buildAuditLogWhereClause({ q: "192.168.1.5" });
  assert.ok(Array.isArray(where.OR));
  assert.equal(where.OR.length, 7);

  const fields = where.OR.map((clause) => Object.keys(clause)[0]);
  assert.ok(fields.includes("action"));
  assert.ok(fields.includes("label"));
  assert.ok(fields.includes("description"));
  assert.ok(fields.includes("ip"));
  assert.ok(fields.includes("userAgent"));
  assert.ok(fields.includes("user"));

  // Verify q truncation at 200 chars
  const longQ = "X".repeat(300);
  const truncatedWhere = buildAuditLogWhereClause({ q: longQ });
  assert.equal(truncatedWhere.OR[0].action.contains.length, 200);
});

test("AuditLog Service: normalizePagination defaults and clamps", () => {
  const def = normalizePagination({});
  assert.equal(def.page, 1);
  assert.equal(def.pageSize, 50);
  assert.equal(def.skip, 0);
  assert.equal(def.take, 50);

  // Clamps pageSize to 100 max
  const capped = normalizePagination({ pageSize: 999 });
  assert.equal(capped.pageSize, 100);
  assert.equal(capped.take, 100);

  // Clamps minimum to 1
  const min = normalizePagination({ pageSize: -5, page: -1 });
  assert.equal(min.page, 1);
  assert.equal(min.pageSize, 1);

  // Calculates offset / limit correctly
  const offsetTest = normalizePagination({ limit: 25, offset: 50 });
  assert.equal(offsetTest.pageSize, 25);
  assert.equal(offsetTest.skip, 50);
  assert.equal(offsetTest.page, 3); // (50 / 25) + 1 = 3
});
