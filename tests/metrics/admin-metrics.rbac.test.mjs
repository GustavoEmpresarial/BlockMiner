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

test("RBAC: resolvePermissions assigns monitoring to super_admin and admin roles", () => {
  const superAdminPerms = resolvePermissions("super_admin");
  assert.equal(hasPermission(superAdminPerms, "monitoring"), true);
  assert.equal(hasPermission(superAdminPerms, "dashboard"), true);

  const adminPerms = resolvePermissions("admin");
  assert.equal(hasPermission(adminPerms, "monitoring"), true);
  assert.equal(hasPermission(adminPerms, "dashboard"), true);
});

test("RBAC: resolvePermissions gives dashboard to readonly and moderator roles", () => {
  const readonlyPerms = resolvePermissions("readonly");
  assert.equal(hasPermission(readonlyPerms, "dashboard"), true);
  assert.equal(hasPermission(readonlyPerms, "monitoring"), false);

  const moderatorPerms = resolvePermissions("moderator");
  assert.equal(hasPermission(moderatorPerms, "dashboard"), true);
});

test("RBAC: requireAdminPermission allows access when role has monitoring or dashboard", () => {
  const middleware = requireAdminPermission("monitoring", "dashboard");

  // Admin with monitoring permission
  const { req: reqAdmin, res: resAdmin } = createMockReqRes({
    admin: { adminId: 1, email: "admin@blockminer.space", role: "admin", permissions: ["monitoring"] },
  });
  let nextCalledAdmin = false;
  middleware(reqAdmin, resAdmin, () => {
    nextCalledAdmin = true;
  });
  assert.equal(nextCalledAdmin, true);
  assert.equal(resAdmin.getStatusCode(), 200);

  // Admin with wildcard permission
  const { req: reqSuper, res: resSuper } = createMockReqRes({
    admin: { adminId: 2, email: "super@blockminer.space", role: "super_admin", permissions: ["*"] },
  });
  let nextCalledSuper = false;
  middleware(reqSuper, resSuper, () => {
    nextCalledSuper = true;
  });
  assert.equal(nextCalledSuper, true);
});

test("RBAC: requireAdminPermission denies access with 403 when admin lacks required permissions", () => {
  const middleware = requireAdminPermission("monitoring", "dashboard");

  // User with only "support" permission
  const { req, res } = createMockReqRes({
    admin: { adminId: 3, email: "support@blockminer.space", role: "support", permissions: ["support"] },
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
  const middleware = requireAdminPermission("monitoring", "dashboard");

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
