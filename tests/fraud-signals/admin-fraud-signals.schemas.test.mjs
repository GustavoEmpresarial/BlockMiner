import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/admin/admin.fraud-signals.schemas.ts");

// ─── adminFraudSignalsQuerySchema ────────────────────────────────────────────

test("adminFraudSignalsQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminFraudSignalsQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.scope, "all");
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 40);
  assert.equal(result.data.q, undefined);
});

test("adminFraudSignalsQuerySchema: accepts custom valid scope, page, limit and search q", () => {
  const result = schemas.adminFraudSignalsQuerySchema.safeParse({
    scope: "ips",
    page: "3",
    limit: "50",
    q: "192.168.1.1",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.scope, "ips");
  assert.equal(result.data.page, 3);
  assert.equal(result.data.limit, 50);
  assert.equal(result.data.q, "192.168.1.1");
});

test("adminFraudSignalsQuerySchema: accepts wallets and devices scope", () => {
  for (const scope of ["wallets", "devices"]) {
    const res = schemas.adminFraudSignalsQuerySchema.safeParse({ scope });
    assert.equal(res.success, true);
    assert.equal(res.data.scope, scope);
  }
});

test("adminFraudSignalsQuerySchema: rejects invalid scope enum", () => {
  const result = schemas.adminFraudSignalsQuerySchema.safeParse({ scope: "invalid_scope" });
  assert.equal(result.success, false);
});

test("adminFraudSignalsQuerySchema: rejects limit out of bounds (< 1 or > 100)", () => {
  const low = schemas.adminFraudSignalsQuerySchema.safeParse({ limit: "0" });
  assert.equal(low.success, false);

  const high = schemas.adminFraudSignalsQuerySchema.safeParse({ limit: "150" });
  assert.equal(high.success, false);
});

test("adminFraudSignalsQuerySchema: rejects negative page", () => {
  const result = schemas.adminFraudSignalsQuerySchema.safeParse({ page: "-1" });
  assert.equal(result.success, false);
});

test("adminFraudSignalsQuerySchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminFraudSignalsQuerySchema.safeParse({
    scope: "all",
    role: "super_admin",
  });
  assert.equal(result.success, false);
});

// ─── adminFraudRefreshIpSchema ───────────────────────────────────────────────

test("adminFraudRefreshIpSchema: accepts valid IPv4 address and defaults forceRefresh to true", () => {
  const result = schemas.adminFraudRefreshIpSchema.safeParse({
    ip: "198.51.100.5",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.ip, "198.51.100.5");
  assert.equal(result.data.forceRefresh, true);
});

test("adminFraudRefreshIpSchema: accepts forceRefresh boolean false", () => {
  const result = schemas.adminFraudRefreshIpSchema.safeParse({
    ip: "2001:db8::1",
    forceRefresh: false,
  });
  assert.equal(result.success, true);
  assert.equal(result.data.forceRefresh, false);
});

test("adminFraudRefreshIpSchema: rejects short or empty IP", () => {
  const empty = schemas.adminFraudRefreshIpSchema.safeParse({ ip: "" });
  assert.equal(empty.success, false);

  const short = schemas.adminFraudRefreshIpSchema.safeParse({ ip: "1" });
  assert.equal(short.success, false);
});

test("adminFraudRefreshIpSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminFraudRefreshIpSchema.safeParse({
    ip: "1.2.3.4",
    injectedKey: true,
  });
  assert.equal(result.success, false);
});

// ─── adminFraudResetCollectionSchema ─────────────────────────────────────────

test("adminFraudResetCollectionSchema: accepts valid confirmation string", () => {
  const result = schemas.adminFraudResetCollectionSchema.safeParse({
    confirm: "RESET_FRAUD_COLLECTION",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.confirm, "RESET_FRAUD_COLLECTION");
});

test("adminFraudResetCollectionSchema: rejects empty confirm string", () => {
  const result = schemas.adminFraudResetCollectionSchema.safeParse({
    confirm: "",
  });
  assert.equal(result.success, false);
});

test("adminFraudResetCollectionSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminFraudResetCollectionSchema.safeParse({
    confirm: "RESET_FRAUD_COLLECTION",
    dropTables: true,
  });
  assert.equal(result.success, false);
});
