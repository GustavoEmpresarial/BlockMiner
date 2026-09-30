import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission, resolvePermissions, hasPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);

function createMockReqRes({ admin = null, body = {}, params = {}, query = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    body,
    params,
    query,
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

// ─── Matriz de Permissões de Fraud Signals ───────────────────────────────────

test("resolvePermissions: admin possui fraud_signals e fraud_signals.view", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("fraud_signals"), true);
  assert.equal(hasPermission(adminPerms, "fraud_signals.view"), true);
});

test("resolvePermissions: moderator possui fraud_signals.view mas não fraud_signals", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("fraud_signals.view"), true);
  assert.equal(hasPermission(modPerms, "fraud_signals.view"), true);
  assert.equal(hasPermission(modPerms, "fraud_signals"), false);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "fraud_signals"), true);
  assert.equal(hasPermission(superPerms, "fraud_signals.view"), true);
});

test("resolvePermissions: roles restritas (readonly, support) não possuem fraud_signals", () => {
  for (const role of ["readonly", "support"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "fraud_signals"), false, `${role} não deve ter permissão fraud_signals`);
    assert.equal(hasPermission(perms, "fraud_signals.view"), false, `${role} não deve ter permissão fraud_signals.view`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (fraud_signals.view) ─────────

test("requireAdminPermission(fraud_signals.view, fraud_signals): rejeita se admin não autenticado (401)", () => {
  const middleware = requireAdminPermission("fraud_signals.view", "fraud_signals");
  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("requireAdminPermission(fraud_signals.view, fraud_signals): rejeita operador financeiro sem permissão (403)", () => {
  const middleware = requireAdminPermission("fraud_signals.view", "fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, email: "finance@test.com", permissions: ["finance"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(fraud_signals.view, fraud_signals): permite moderador com fraud_signals.view", () => {
  const middleware = requireAdminPermission("fraud_signals.view", "fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "mod@test.com", permissions: ["fraud_signals.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(fraud_signals.view, fraud_signals): permite admin com permissão fraud_signals", () => {
  const middleware = requireAdminPermission("fraud_signals.view", "fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 4, email: "admin@test.com", permissions: ["fraud_signals"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(fraud_signals.view, fraud_signals): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("fraud_signals.view", "fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

// ─── Middleware requireAdminPermission: Mutação / Reset (fraud_signals) ──────

test("requireAdminPermission(fraud_signals): rejeita moderador com apenas fraud_signals.view (403)", () => {
  const middleware = requireAdminPermission("fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 5, email: "mod@test.com", permissions: ["fraud_signals.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(fraud_signals): permite admin com permissão fraud_signals", () => {
  const middleware = requireAdminPermission("fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 6, email: "admin@test.com", permissions: ["fraud_signals"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(fraud_signals): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("fraud_signals");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
