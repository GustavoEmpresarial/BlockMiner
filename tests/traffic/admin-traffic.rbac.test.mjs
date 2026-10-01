import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission, resolvePermissions, hasPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);

function createMockReqRes({ admin = null } = {}) {
  const req = {
    admin,
    headers: {},
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

// ─── Matriz de Permissões de Tráfego ─────────────────────────────────────────

test("RBAC: resolvePermissions assigns traffic to super_admin and admin roles", () => {
  const superAdminPerms = resolvePermissions("super_admin");
  assert.equal(hasPermission(superAdminPerms, "traffic"), true);
  assert.equal(hasPermission(superAdminPerms, "traffic.view"), true);

  const adminPerms = resolvePermissions("admin");
  assert.equal(hasPermission(adminPerms, "traffic"), true);
  assert.equal(hasPermission(adminPerms, "traffic.view"), true);
});

test("RBAC: resolvePermissions gives traffic.view to moderator role", () => {
  const moderatorPerms = resolvePermissions("moderator");
  assert.equal(hasPermission(moderatorPerms, "traffic.view"), true);
  assert.equal(hasPermission(moderatorPerms, "traffic"), false);
});

test("RBAC: requireAdminPermission allows access when role has traffic, traffic.view, monitoring or dashboard", () => {
  const middleware = requireAdminPermission("traffic", "traffic.view", "monitoring", "dashboard");

  // Admin with traffic permission
  const { req: reqAdmin, res: resAdmin } = createMockReqRes({
    admin: { adminId: 1, email: "admin@blockminer.space", role: "admin", permissions: ["traffic"] },
  });
  let nextCalledAdmin = false;
  middleware(reqAdmin, resAdmin, () => {
    nextCalledAdmin = true;
  });
  assert.equal(nextCalledAdmin, true);
  assert.equal(resAdmin.getStatusCode(), 200);

  // Moderator with traffic.view
  const { req: reqMod, res: resMod } = createMockReqRes({
    admin: { adminId: 2, email: "mod@blockminer.space", role: "moderator", permissions: ["traffic.view"] },
  });
  let nextCalledMod = false;
  middleware(reqMod, resMod, () => {
    nextCalledMod = true;
  });
  assert.equal(nextCalledMod, true);

  // Readonly with dashboard
  const { req: reqReadOnly, res: resReadOnly } = createMockReqRes({
    admin: { adminId: 3, email: "ro@blockminer.space", role: "readonly", permissions: ["dashboard"] },
  });
  let nextCalledReadOnly = false;
  middleware(reqReadOnly, resReadOnly, () => {
    nextCalledReadOnly = true;
  });
  assert.equal(nextCalledReadOnly, true);

  // Super Admin with wildcard
  const { req: reqSuper, res: resSuper } = createMockReqRes({
    admin: { adminId: 4, email: "super@blockminer.space", role: "super_admin", permissions: ["*"] },
  });
  let nextCalledSuper = false;
  middleware(reqSuper, resSuper, () => {
    nextCalledSuper = true;
  });
  assert.equal(nextCalledSuper, true);
});

test("RBAC: requireAdminPermission denies access with 403 when admin lacks required permissions", () => {
  const middleware = requireAdminPermission("traffic", "traffic.view", "monitoring", "dashboard");

  // Operator with only "support"
  const { req, res } = createMockReqRes({
    admin: { adminId: 5, email: "support@blockminer.space", role: "support", permissions: ["support"] },
  });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 403);
  assert.equal(res.getData().ok, false);
  assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission denies access with 401 when request is unauthenticated", () => {
  const middleware = requireAdminPermission("traffic", "traffic.view", "monitoring", "dashboard");

  const { req, res } = createMockReqRes({ admin: null });
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData().ok, false);
  assert.equal(res.getData().message, "Acesso não autorizado.");
});
