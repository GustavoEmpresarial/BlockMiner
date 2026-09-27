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

// ─── Matriz de Permissões Básica ─────────────────────────────────────────────

test("resolvePermissions: atribui read_earn para admin e concede read_earn.view via hasPermission", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("read_earn"), true);
  assert.equal(hasPermission(adminPerms, "read_earn.view"), true);
});

test("resolvePermissions: atribui read_earn.view (apenas leitura) para moderator", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("read_earn.view"), true);
  assert.equal(hasPermission(modPerms, "read_earn"), false);
});

test("resolvePermissions: super_admin possui wildcard global", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "read_earn"), true);
  assert.equal(hasPermission(superPerms, "read_earn.view"), true);
});

test("resolvePermissions: finance, support e readonly não possuem acesso a read_earn", () => {
  for (const role of ["finance", "support", "readonly"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "read_earn"), false, `${role} não deve ter read_earn`);
    assert.equal(hasPermission(perms, "read_earn.view"), false, `${role} não deve ter read_earn.view`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (read_earn.view) ─────────────

test("requireAdminPermission(read_earn.view, read_earn): rejeita se não autenticado (401)", () => {
  const middleware = requireAdminPermission("read_earn.view", "read_earn");
  const { req, res } = createMockReqRes({ admin: null });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData()?.ok, false);
});

test("requireAdminPermission(read_earn.view, read_earn): permite moderator (read_earn.view)", () => {
  const middleware = requireAdminPermission("read_earn.view", "read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["read_earn.view"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(read_earn.view, read_earn): permite admin (read_earn)", () => {
  const middleware = requireAdminPermission("read_earn.view", "read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["read_earn"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(read_earn.view, read_earn): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("read_earn.view", "read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 99, role: "super_admin", permissions: ["*"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(read_earn.view, read_earn): bloqueia finance/support (403)", () => {
  const middleware = requireAdminPermission("read_earn.view", "read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, role: "finance", permissions: ["finance", "withdrawals"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData()?.code, "FORBIDDEN_PERMISSION");
});

// ─── Middleware requireAdminPermission: Escrita (read_earn) ───────────────────

test("requireAdminPermission(read_earn): bloqueia moderator que possui apenas read_earn.view (403)", () => {
  const middleware = requireAdminPermission("read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["read_earn.view"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData()?.code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(read_earn): permite admin com permissão read_earn", () => {
  const middleware = requireAdminPermission("read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["read_earn"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(read_earn): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("read_earn");
  const { req, res } = createMockReqRes({
    admin: { adminId: 99, role: "super_admin", permissions: ["*"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});
