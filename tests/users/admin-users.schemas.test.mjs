import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/users/users.admin.schemas.ts");

// ─── adminUserIdParamSchema ──────────────────────────────────────────────────

test("adminUserIdParamSchema: accepts valid integer id", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "10" });
  assert.equal(result.success, true);
  assert.equal(result.data.id, 10);
});

test("adminUserIdParamSchema: rejects negative id", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "-5" });
  assert.equal(result.success, false);
});

test("adminUserIdParamSchema: rejects zero id", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "0" });
  assert.equal(result.success, false);
});

test("adminUserIdParamSchema: rejects float id", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "12.34" });
  assert.equal(result.success, false);
});

test("adminUserIdParamSchema: rejects 32-bit overflow id", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "2147483648" });
  assert.equal(result.success, false);
});

test("adminUserIdParamSchema: rejects non-numeric id", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "user-abc" });
  assert.equal(result.success, false);
});

test("adminUserIdParamSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminUserIdParamSchema.safeParse({ id: "1", role: "super_admin" });
  assert.equal(result.success, false);
});

// ─── adminUsersListQuerySchema ───────────────────────────────────────────────

test("adminUsersListQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminUsersListQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.page, 1);
  assert.equal(result.data.pageSize, 25);
  assert.equal(result.data.status, "all");
});

test("adminUsersListQuerySchema: accepts custom valid query parameters", () => {
  const result = schemas.adminUsersListQuerySchema.safeParse({
    page: "2",
    pageSize: "50",
    query: "gustavo",
    status: "active",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.pageSize, 50);
  assert.equal(result.data.query, "gustavo");
  assert.equal(result.data.status, "active");
});

test("adminUsersListQuerySchema: rejects invalid status enum", () => {
  const result = schemas.adminUsersListQuerySchema.safeParse({ status: "invalid_status" });
  assert.equal(result.success, false);
});

test("adminUsersListQuerySchema: rejects pageSize out of bounds (> 100)", () => {
  const result = schemas.adminUsersListQuerySchema.safeParse({ pageSize: "200" });
  assert.equal(result.success, false);
});

test("adminUsersListQuerySchema: rejects unknown properties (.strict)", () => {
  const result = schemas.adminUsersListQuerySchema.safeParse({ page: 1, hack: true });
  assert.equal(result.success, false);
});

// ─── adminAdjustBalanceSchema ────────────────────────────────────────────────

test("adminAdjustBalanceSchema: accepts valid POL balance addition", () => {
  const result = schemas.adminAdjustBalanceSchema.safeParse({
    currency: "pol",
    mode: "add",
    amount: "10.5",
    reason: "Compensação de teste",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.currency, "pol");
  assert.equal(result.data.mode, "add");
  assert.equal(result.data.amount, 10.5);
  assert.equal(result.data.reason, "Compensação de teste");
});

test("adminAdjustBalanceSchema: accepts valid BLK balance set mode", () => {
  const result = schemas.adminAdjustBalanceSchema.safeParse({
    currency: "blk",
    mode: "set",
    amount: 500,
  });
  assert.equal(result.success, true);
  assert.equal(result.data.currency, "blk");
  assert.equal(result.data.mode, "set");
  assert.equal(result.data.amount, 500);
});

test("adminAdjustBalanceSchema: accepts all 9 currencies", () => {
  for (const c of ["pol", "blk", "blkLocked", "shib", "btc", "eth", "usdt", "usdc", "zer"]) {
    const res = schemas.adminAdjustBalanceSchema.safeParse({
      currency: c,
      mode: "add",
      amount: 1,
    });
    assert.equal(res.success, true);
    assert.equal(res.data.currency, c);
  }
});

test("adminAdjustBalanceSchema: rejects invalid currency", () => {
  const result = schemas.adminAdjustBalanceSchema.safeParse({
    currency: "invalid_coin",
    mode: "add",
    amount: 1,
  });
  assert.equal(result.success, false);
});

test("adminAdjustBalanceSchema: rejects invalid mode", () => {
  const result = schemas.adminAdjustBalanceSchema.safeParse({
    currency: "pol",
    mode: "multiply",
    amount: 1,
  });
  assert.equal(result.success, false);
});

test("adminAdjustBalanceSchema: rejects excessive amount exceeding 1 billion", () => {
  const result = schemas.adminAdjustBalanceSchema.safeParse({
    currency: "pol",
    mode: "set",
    amount: 10_000_000_000,
  });
  assert.equal(result.success, false);
});

test("adminAdjustBalanceSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminAdjustBalanceSchema.safeParse({
    currency: "pol",
    mode: "add",
    amount: 10,
    directWithdraw: true,
  });
  assert.equal(result.success, false);
});

// ─── adminBanUserSchema ──────────────────────────────────────────────────────

test("adminBanUserSchema: accepts valid reason and duration in days", () => {
  const result = schemas.adminBanUserSchema.safeParse({
    reason: "Violação dos termos de uso",
    days: "7",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.reason, "Violação dos termos de uso");
  assert.equal(result.data.days, 7);
});

test("adminBanUserSchema: accepts empty parameters (permanent ban / default reason)", () => {
  const result = schemas.adminBanUserSchema.safeParse({});
  assert.equal(result.success, true);
});

test("adminBanUserSchema: rejects negative duration days", () => {
  const result = schemas.adminBanUserSchema.safeParse({ days: "-3" });
  assert.equal(result.success, false);
});

test("adminBanUserSchema: rejects unknown properties (.strict)", () => {
  const result = schemas.adminBanUserSchema.safeParse({ days: 5, deleteAccount: true });
  assert.equal(result.success, false);
});

// ─── adminResetPasswordSchema ────────────────────────────────────────────────

test("adminResetPasswordSchema: accepts valid manual password (min 6 chars)", () => {
  const result = schemas.adminResetPasswordSchema.safeParse({
    newPassword: "SecurePassword123!",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.newPassword, "SecurePassword123!");
});

test("adminResetPasswordSchema: accepts empty body for automatic password generation", () => {
  const result = schemas.adminResetPasswordSchema.safeParse({});
  assert.equal(result.success, true);
});

test("adminResetPasswordSchema: rejects short password (< 6 chars)", () => {
  const result = schemas.adminResetPasswordSchema.safeParse({ newPassword: "123" });
  assert.equal(result.success, false);
});

test("adminResetPasswordSchema: rejects unknown properties (.strict)", () => {
  const result = schemas.adminResetPasswordSchema.safeParse({ newPassword: "ValidPassword1", adminKey: "x" });
  assert.equal(result.success, false);
});

// ─── adminSendMinerSchema ────────────────────────────────────────────────────

test("adminSendMinerSchema: accepts valid minerId and quantity", () => {
  const result = schemas.adminSendMinerSchema.safeParse({
    minerId: "5",
    quantity: "2",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.minerId, 5);
  assert.equal(result.data.quantity, 2);
});

test("adminSendMinerSchema: defaults quantity to 1 when omitted", () => {
  const result = schemas.adminSendMinerSchema.safeParse({
    minerId: 3,
  });
  assert.equal(result.success, true);
  assert.equal(result.data.quantity, 1);
});

test("adminSendMinerSchema: rejects quantity exceeding 50", () => {
  const result = schemas.adminSendMinerSchema.safeParse({
    minerId: 3,
    quantity: 100,
  });
  assert.equal(result.success, false);
});

test("adminSendMinerSchema: rejects quantity less than 1", () => {
  const result = schemas.adminSendMinerSchema.safeParse({
    minerId: 3,
    quantity: 0,
  });
  assert.equal(result.success, false);
});

test("adminSendMinerSchema: rejects unknown properties (.strict)", () => {
  const result = schemas.adminSendMinerSchema.safeParse({
    minerId: 3,
    isFree: true,
  });
  assert.equal(result.success, false);
});
