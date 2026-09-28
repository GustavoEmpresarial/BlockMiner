import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission, resolvePermissions, hasPermission } = await import(
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

// ─── Matriz de Permissões Tasks ──────────────────────────────────────────────

test("resolvePermissions: atribui tasks para admin e concede tasks.view via hasPermission", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("tasks"), true);
  assert.equal(hasPermission(adminPerms, "tasks.view"), true);
});

test("resolvePermissions: atribui tasks.view (apenas leitura) para moderator", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("tasks.view"), true);
  assert.equal(hasPermission(modPerms, "tasks"), false);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "tasks"), true);
  assert.equal(hasPermission(superPerms, "tasks.view"), true);
});

test("resolvePermissions: finance, support e readonly não possuem acesso a tasks", () => {
  for (const role of ["finance", "support", "readonly"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "tasks"), false, `${role} não deve ter tasks`);
    assert.equal(hasPermission(perms, "tasks.view"), false, `${role} não deve ter tasks.view`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (tasks.view, tasks) ──────────

test("requireAdminPermission(tasks.view, tasks): rejeita se não autenticado (401)", () => {
  const middleware = requireAdminPermission("tasks.view", "tasks");
  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("requireAdminPermission(tasks.view, tasks): permite moderator (tasks.view)", () => {
  const middleware = requireAdminPermission("tasks.view", "tasks");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: resolvePermissions("moderator") },
  });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(tasks.view, tasks): permite admin (tasks)", () => {
  const middleware = requireAdminPermission("tasks.view", "tasks");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: resolvePermissions("admin") },
  });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(tasks.view, tasks): bloqueia finance/support (403)", () => {
  const middleware = requireAdminPermission("tasks.view", "tasks");
  for (const role of ["finance", "support", "readonly"]) {
    const { req, res } = createMockReqRes({
      admin: { adminId: 99, role, permissions: resolvePermissions(role) },
    });
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.getStatusCode(), 403);
    assert.equal(res.getData()?.code, "FORBIDDEN_PERMISSION");
  }
});

// ─── Middleware requireAdminPermission: Mutação (tasks) ───────────────────────

test("requireAdminPermission(tasks): bloqueia moderator que possui apenas tasks.view (403)", () => {
  const middleware = requireAdminPermission("tasks");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: resolvePermissions("moderator") },
  });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData()?.code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(tasks): permite admin com permissão tasks", () => {
  const middleware = requireAdminPermission("tasks");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: resolvePermissions("admin") },
  });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(tasks): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("tasks");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "super_admin", permissions: resolvePermissions("super_admin") },
  });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.getStatusCode(), 200);
});
