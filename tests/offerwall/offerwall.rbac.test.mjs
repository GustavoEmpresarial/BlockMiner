import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission, resolvePermissions, hasPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);

function createMockReqRes({ admin = null, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    ip,
    headers: { "user-agent": "test-agent" },
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

// ─── Matriz de Permissões Offerwall ──────────────────────────────────────────

test("resolvePermissions: atribui offerwall para admin e concede offerwall.view via hasPermission", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("offerwall"), true);
  assert.equal(hasPermission(adminPerms, "offerwall.view"), true);
});

test("resolvePermissions: atribui offerwall.view (apenas leitura) para moderator", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("offerwall.view"), true);
  assert.equal(hasPermission(modPerms, "offerwall"), false);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "offerwall"), true);
  assert.equal(hasPermission(superPerms, "offerwall.view"), true);
});

test("resolvePermissions: finance, support e readonly não possuem acesso a offerwall", () => {
  for (const role of ["finance", "support", "readonly"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "offerwall"), false, `${role} não deve ter offerwall`);
    assert.equal(hasPermission(perms, "offerwall.view"), false, `${role} não deve ter offerwall.view`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (offerwall.view, offerwall) ───

test("requireAdminPermission(offerwall.view, offerwall): rejeita se não autenticado (401)", () => {
  const middleware = requireAdminPermission("offerwall.view", "offerwall");
  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
});

test("requireAdminPermission(offerwall.view, offerwall): permite moderator (offerwall.view)", () => {
  const middleware = requireAdminPermission("offerwall.view", "offerwall");
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

test("requireAdminPermission(offerwall.view, offerwall): permite admin (offerwall)", () => {
  const middleware = requireAdminPermission("offerwall.view", "offerwall");
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

test("requireAdminPermission(offerwall.view, offerwall): bloqueia finance/support/readonly (403)", () => {
  const middleware = requireAdminPermission("offerwall.view", "offerwall");
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
