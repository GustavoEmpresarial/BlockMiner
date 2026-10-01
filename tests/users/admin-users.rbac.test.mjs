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

// ─── Matriz de Permissões de Usuários ─────────────────────────────────────────

test("resolvePermissions: admin possui permissão users e users.view via defaults", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("users"), true);
  assert.equal(hasPermission(adminPerms, "users.view"), true);
  assert.equal(hasPermission(adminPerms, "users.ban"), true);
});

test("resolvePermissions: moderator possui users.view e users.ban, mas não users", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("users.view"), true);
  assert.equal(modPerms.includes("users.ban"), true);
  assert.equal(hasPermission(modPerms, "users.view"), true);
  assert.equal(hasPermission(modPerms, "users.ban"), true);
  assert.equal(hasPermission(modPerms, "users"), false);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "users"), true);
  assert.equal(hasPermission(superPerms, "users.view"), true);
  assert.equal(hasPermission(superPerms, "users.ban"), true);
});

test("resolvePermissions: roles restritas (readonly) não possuem mutações", () => {
  const roPerms = resolvePermissions("readonly");
  assert.equal(hasPermission(roPerms, "users"), false);
  assert.equal(hasPermission(roPerms, "users.ban"), false);
});

// ─── Middleware requireAdminPermission: Leitura (users.view) ───────────────────

test("requireAdminPermission(users.view, users): rejeita se admin não autenticado (401)", () => {
  const middleware = requireAdminPermission("users.view", "users");
  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("requireAdminPermission(users.view, users): permite moderador com users.view", () => {
  const middleware = requireAdminPermission("users.view", "users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "mod@test.com", permissions: ["users.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(users.view, users): permite admin com permissão users", () => {
  const middleware = requireAdminPermission("users.view", "users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 4, email: "admin@test.com", permissions: ["users"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

// ─── Middleware requireAdminPermission: Banimento (users.ban) ─────────────────

test("requireAdminPermission(users.ban, users): permite moderador com users.ban", () => {
  const middleware = requireAdminPermission("users.ban", "users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "mod@test.com", permissions: ["users.ban"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(users.ban, users): rejeita operador com apenas users.view (403)", () => {
  const middleware = requireAdminPermission("users.ban", "users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 5, email: "reader@test.com", permissions: ["users.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
});

// ─── Middleware requireAdminPermission: Mutação de Saldo (users) ───────────────

test("requireAdminPermission(users): rejeita moderador com users.view e users.ban ao tentar ajustar saldo (403)", () => {
  const middleware = requireAdminPermission("users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "mod@test.com", permissions: ["users.view", "users.ban"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(users): permite admin com permissão users", () => {
  const middleware = requireAdminPermission("users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["users"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(users): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("users");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "super@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
