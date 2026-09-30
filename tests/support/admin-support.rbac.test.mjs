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

// ─── Matriz de Permissões de Suporte ──────────────────────────────────────────

test("resolvePermissions: atribui support para role support e concede support.view via hasPermission", () => {
  const supportPerms = resolvePermissions("support");
  assert.equal(supportPerms.includes("support"), true);
  assert.equal(hasPermission(supportPerms, "support.view"), true);
});

test("resolvePermissions: atribui support e support.view para role moderator", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("support"), true);
  assert.equal(hasPermission(modPerms, "support.view"), true);
  assert.equal(hasPermission(modPerms, "support"), true);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "support"), true);
  assert.equal(hasPermission(superPerms, "support.view"), true);
});

test("resolvePermissions: roles sem suporte (finance, readonly) não possuem acesso de escrita", () => {
  for (const role of ["finance", "readonly"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "support"), false, `${role} não deve ter permissão support`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (support.view) ─────────────────

test("requireAdminPermission(support.view, support): rejeita se admin não autenticado (401)", () => {
  const middleware = requireAdminPermission("support.view", "support");
  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("requireAdminPermission(support.view, support): rejeita admin com papel financeiro sem suporte (403)", () => {
  const middleware = requireAdminPermission("support.view", "support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, email: "finance@test.com", permissions: ["finance"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
});

test("requireAdminPermission(support.view, support): permite admin com permissão support.view", () => {
  const middleware = requireAdminPermission("support.view", "support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "mod@test.com", permissions: ["support.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(support.view, support): permite admin com permissão support", () => {
  const middleware = requireAdminPermission("support.view", "support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 4, email: "support@test.com", permissions: ["support"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(support.view, support): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("support.view", "support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

// ─── Middleware requireAdminPermission: Mutação / Compensação (support) ─────────

test("requireAdminPermission(support): rejeita admin que possui apenas support.view (403)", () => {
  const middleware = requireAdminPermission("support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 5, email: "reader@test.com", permissions: ["support.view"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(support): permite admin com permissão support", () => {
  const middleware = requireAdminPermission("support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 6, email: "agent@test.com", permissions: ["support"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("requireAdminPermission(support): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("support");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, email: "root@test.com", permissions: ["*"] },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
