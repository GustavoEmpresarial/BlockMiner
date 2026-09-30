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

// ─── Matriz de Permissões do AntiBot ──────────────────────────────────────────

test("resolvePermissions: admin possui antibot e antibot.view via defaults", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("antibot"), true);
  assert.equal(hasPermission(adminPerms, "antibot.view"), true);
});

test("resolvePermissions: moderator possui apenas antibot.view (leitura)", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("antibot.view"), true);
  assert.equal(hasPermission(modPerms, "antibot.view"), true);
  assert.equal(hasPermission(modPerms, "antibot"), false);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "antibot"), true);
  assert.equal(hasPermission(superPerms, "antibot.view"), true);
});

test("resolvePermissions: roles restritas (readonly, finance) não possuem antibot", () => {
  for (const role of ["readonly", "finance"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "antibot"), false, `${role} não deve ter permissão antibot`);
    assert.equal(hasPermission(perms, "antibot.view"), false, `${role} não deve ter permissão antibot.view`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (antibot.view) ─────────────────

test("requireAdminPermission(antibot.view, antibot): rejeita se admin não autenticado (401)", () => {
  const middleware = requireAdminPermission("antibot.view", "antibot");
  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("requireAdminPermission(antibot.view, antibot): rejeita operador financeiro sem permissão de antibot (403)", () => {
  const middleware = requireAdminPermission("antibot.view", "antibot");
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

test("requireAdminPermission(antibot.view, antibot): permite moderador com antibot.view", () => {
  const middleware = requireAdminPermission("antibot.view", "antibot");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "mod@test.com", permissions: ["antibot.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(antibot.view, antibot): permite admin com permissão antibot", () => {
  const middleware = requireAdminPermission("antibot.view", "antibot");
  const { req, res } = createMockReqRes({
    admin: { adminId: 4, email: "admin@test.com", permissions: ["antibot"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(antibot.view, antibot): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("antibot.view", "antibot");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

// ─── Middleware requireAdminPermission: Mutação / Reset (antibot) ──────────────

test("requireAdminPermission(antibot): rejeita moderador com apenas antibot.view (403)", () => {
  const middleware = requireAdminPermission("antibot");
  const { req, res } = createMockReqRes({
    admin: { adminId: 5, email: "mod@test.com", permissions: ["antibot.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(antibot): permite admin com permissão antibot", () => {
  const middleware = requireAdminPermission("antibot");
  const { req, res } = createMockReqRes({
    admin: { adminId: 6, email: "admin@test.com", permissions: ["antibot"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(antibot): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("antibot");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
