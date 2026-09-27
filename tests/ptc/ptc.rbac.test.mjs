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

// ─── Matriz de Permissões PTC ────────────────────────────────────────────────

test("resolvePermissions: atribui ptc para admin e concede ptc.view via hasPermission", () => {
  const adminPerms = resolvePermissions("admin");
  assert.equal(adminPerms.includes("ptc"), true);
  assert.equal(hasPermission(adminPerms, "ptc.view"), true);
});

test("resolvePermissions: atribui ptc.view (apenas leitura) para moderator", () => {
  const modPerms = resolvePermissions("moderator");
  assert.equal(modPerms.includes("ptc.view"), true);
  assert.equal(hasPermission(modPerms, "ptc"), false);
});

test("resolvePermissions: super_admin possui wildcard global (*)", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.equal(superPerms.includes("*"), true);
  assert.equal(hasPermission(superPerms, "ptc"), true);
  assert.equal(hasPermission(superPerms, "ptc.view"), true);
});

test("resolvePermissions: finance, support e readonly não possuem acesso a ptc", () => {
  for (const role of ["finance", "support", "readonly"]) {
    const perms = resolvePermissions(role);
    assert.equal(hasPermission(perms, "ptc"), false, `${role} não deve ter ptc`);
    assert.equal(hasPermission(perms, "ptc.view"), false, `${role} não deve ter ptc.view`);
  }
});

// ─── Middleware requireAdminPermission: Leitura (ptc.view) ───────────────────

test("requireAdminPermission(ptc.view, ptc): rejeita se não autenticado (401)", () => {
  const middleware = requireAdminPermission("ptc.view", "ptc");
  const { req, res } = createMockReqRes({ admin: null });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData()?.ok, false);
});

test("requireAdminPermission(ptc.view, ptc): permite moderator (ptc.view)", () => {
  const middleware = requireAdminPermission("ptc.view", "ptc");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["ptc.view"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(ptc.view, ptc): permite admin (ptc)", () => {
  const middleware = requireAdminPermission("ptc.view", "ptc");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["ptc"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(ptc.view, ptc): bloqueia finance/support (403)", () => {
  const middleware = requireAdminPermission("ptc.view", "ptc");
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

// ─── Middleware requireAdminPermission: Escrita (ptc) ─────────────────────────

test("requireAdminPermission(ptc): bloqueia moderator que possui apenas ptc.view (403)", () => {
  const middleware = requireAdminPermission("ptc");
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["ptc.view"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData()?.code, "FORBIDDEN_PERMISSION");
});

test("requireAdminPermission(ptc): permite admin com permissão ptc", () => {
  const middleware = requireAdminPermission("ptc");
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["ptc"] },
  });
  let calledNext = false;

  middleware(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
  assert.equal(res.getStatusCode(), 200);
});

test("requireAdminPermission(ptc): permite super_admin com wildcard (*)", () => {
  const middleware = requireAdminPermission("ptc");
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
