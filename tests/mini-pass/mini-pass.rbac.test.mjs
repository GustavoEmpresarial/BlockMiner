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

// ─── Matriz de Permissões Mini Pass ──────────────────────────────────────────

test("resolvePermissions: super_admin possui wildcard (*)", () => {
  const perms = resolvePermissions("super_admin");
  assert.ok(perms.includes("*"));
  assert.equal(hasPermission(perms, "mini_pass"), true);
  assert.equal(hasPermission(perms, "mini_pass.view"), true);
});

test("resolvePermissions: admin possui mini_pass e mini_pass.view", () => {
  const perms = resolvePermissions("admin");
  assert.ok(perms.includes("mini_pass"));
  assert.equal(hasPermission(perms, "mini_pass.view"), true);
});

test("resolvePermissions: moderator possui apenas leitura (mini_pass.view)", () => {
  const perms = resolvePermissions("moderator");
  assert.ok(perms.includes("mini_pass.view"));
  assert.equal(hasPermission(perms, "mini_pass.view"), true);
  assert.equal(hasPermission(perms, "mini_pass"), false);
});

test("requireAdminPermission: permite leitura para moderador (viewGuard)", () => {
  const guard = requireAdminPermission("mini_pass.view", "mini_pass");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 2,
      email: "mod@blockminer.test",
      role: "moderator",
      permissions: ["mini_pass.view"],
    },
  });

  let called = false;
  guard(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission: bloqueia moderador em mutações administrativas de temporada (manageGuard)", () => {
  const guard = requireAdminPermission("mini_pass");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 2,
      email: "mod@blockminer.test",
      role: "moderator",
      permissions: ["mini_pass.view"],
    },
  });

  let called = false;
  guard(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData()?.code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission: bloqueia roles não autorizados como finance e support (403)", () => {
  const guard = requireAdminPermission("mini_pass.view", "mini_pass");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 5,
      email: "finance@blockminer.test",
      role: "finance",
      permissions: ["payments", "withdrawals"],
    },
  });

  let called = false;
  guard(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 403);
});

test("requireAdminPermission: rejeita requisições sem autenticação admin (401)", () => {
  const guard = requireAdminPermission("mini_pass.view", "mini_pass");
  const { req, res } = createMockReqRes({ admin: null });

  let called = false;
  guard(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 401);
});
