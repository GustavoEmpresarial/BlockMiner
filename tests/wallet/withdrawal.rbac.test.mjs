import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);

function createMockReqRes({ admin = null, body = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    body,
    ip,
    headers: { "user-agent": "test-agent" },
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };

  let statusCode = 200;
  let sentData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      sentData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return sentData;
    },
  };

  return { req, res };
}

// ─── RBAC: Leitura (Pending Withdrawals & Hot Wallet) ────────────────────────

test("RBAC GET: requireAdminPermission('withdrawals', 'finance') rejeita requisição não autenticada com 401", () => {
  const middleware = requireAdminPermission("withdrawals", "finance");
  const { req, res } = createMockReqRes({ admin: null });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("RBAC GET: rejeita admin com perfil sem finance/withdrawals com 403 (ex.: support)", () => {
  const middleware = requireAdminPermission("withdrawals", "finance");
  const { req, res } = createMockReqRes({
    admin: { id: 10, email: "support@test.com", permissions: ["support", "dashboard"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC GET: permite usuário com perfil finance", () => {
  const middleware = requireAdminPermission("withdrawals", "finance");
  const { req, res } = createMockReqRes({
    admin: { id: 11, email: "finance@test.com", permissions: ["dashboard", "finance"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("RBAC GET: permite admin com permissão 'withdrawals'", () => {
  const middleware = requireAdminPermission("withdrawals", "finance");
  const { req, res } = createMockReqRes({
    admin: { id: 12, email: "admin@test.com", permissions: ["dashboard", "withdrawals"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

// ─── RBAC: Mutações (Approve, Reject, Complete) ─────────────────────────────

test("RBAC POST: requireAdminPermission('withdrawals') rejeita perfil apenas 'finance' sem 'withdrawals' com 403", () => {
  const middleware = requireAdminPermission("withdrawals");
  const { req, res } = createMockReqRes({
    admin: { id: 11, email: "finance_viewer@test.com", permissions: ["dashboard", "finance.view"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC POST: permite admin com permissão 'withdrawals'", () => {
  const middleware = requireAdminPermission("withdrawals");
  const { req, res } = createMockReqRes({
    admin: { id: 12, email: "admin@test.com", permissions: ["dashboard", "withdrawals"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("RBAC POST: permite super_admin com wildcard '*'", () => {
  const middleware = requireAdminPermission("withdrawals");
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "super@test.com", permissions: ["*"] },
  });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
