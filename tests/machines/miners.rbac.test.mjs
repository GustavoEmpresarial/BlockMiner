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

test("RBAC: admin role default permissions include 'miners'", () => {
  const perms = resolvePermissions("admin");
  assert.equal(perms.includes("miners"), true);
  assert.equal(hasPermission(perms, "miners"), true);
  assert.equal(hasPermission(perms, "miners.view"), true);
});

test("RBAC: moderator role default permissions include 'miners.view'", () => {
  const perms = resolvePermissions("moderator");
  assert.equal(perms.includes("miners.view"), true);
  assert.equal(hasPermission(perms, "miners.view"), true);
  assert.equal(hasPermission(perms, "miners"), false);
});

test("RBAC: requireAdminPermission('miners.view') allows moderator with 'miners.view'", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["miners.view", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("miners.view");
  middleware(req, res, next);

  assert.equal(called, true);
  assert.equal(res.getStatusCode(), 200);
});

test("RBAC: requireAdminPermission('miners') rejects moderator with 403 FORBIDDEN_PERMISSION", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["miners.view", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("miners");
  middleware(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 403);
  const data = res.getData();
  assert.equal(data.ok, false);
  assert.equal(data.code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission('miners') allows admin with 'miners'", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["miners", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("miners");
  middleware(req, res, next);

  assert.equal(called, true);
  assert.equal(res.getStatusCode(), 200);
});

test("RBAC: requireAdminPermission rejects unauthenticated request with 401", () => {
  const { req, res } = createMockReqRes({ admin: null });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("miners");
  middleware(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 401);
});

test("RBAC: super admin with wildcard '*' has access to both miners and miners.view", () => {
  const perms = ["*"];
  assert.equal(hasPermission(perms, "miners"), true);
  assert.equal(hasPermission(perms, "miners.view"), true);
});
