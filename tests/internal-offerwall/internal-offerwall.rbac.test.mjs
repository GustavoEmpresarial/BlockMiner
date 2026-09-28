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

// ─── Matriz de Permissões Internal Offerwall ─────────────────────────────────

test("resolvePermissions: super_admin possui wildcard (*)", () => {
  const perms = resolvePermissions("super_admin");
  assert.ok(perms.includes("*"));
  assert.equal(hasPermission(perms, "internal_offerwall"), true);
  assert.equal(hasPermission(perms, "internal_offerwall.view"), true);
});

test("resolvePermissions: admin possui internal_offerwall e internal_offerwall.view", () => {
  const perms = resolvePermissions("admin");
  assert.ok(perms.includes("internal_offerwall"));
  assert.equal(hasPermission(perms, "internal_offerwall.view"), true);
});

test("resolvePermissions: moderator possui apenas leitura (internal_offerwall.view)", () => {
  const perms = resolvePermissions("moderator");
  assert.ok(perms.includes("internal_offerwall.view"));
  assert.equal(hasPermission(perms, "internal_offerwall.view"), true);
  assert.equal(hasPermission(perms, "internal_offerwall"), false);
});

test("requireAdminPermission: permite leitura para moderador", () => {
  const guard = requireAdminPermission(
    "internal_offerwall.view",
    "internal_offerwall",
    "offerwall.view",
    "offerwall",
  );
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 2,
      email: "mod@blockminer.test",
      role: "moderator",
      permissions: ["internal_offerwall.view"],
    },
  });

  let called = false;
  guard(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission: bloqueia moderador em mutações administrativas (403)", () => {
  const guard = requireAdminPermission("internal_offerwall", "offerwall");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 2,
      email: "mod@blockminer.test",
      role: "moderator",
      permissions: ["internal_offerwall.view"],
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
  const guard = requireAdminPermission("internal_offerwall.view", "internal_offerwall");
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

test("requireAdminPermission: rejeita requisições sem contexto admin (401)", () => {
  const guard = requireAdminPermission("internal_offerwall.view", "internal_offerwall");
  const { req, res } = createMockReqRes({ admin: null });

  let called = false;
  guard(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 401);
});
