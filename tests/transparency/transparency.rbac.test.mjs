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

test("RBAC: admin role default permissions include 'transparency'", () => {
  const perms = resolvePermissions("admin");
  assert.equal(perms.includes("transparency"), true);
  assert.equal(hasPermission(perms, "transparency"), true);
  assert.equal(hasPermission(perms, "transparency.view"), true);
});

test("RBAC: moderator role default permissions include 'transparency.view'", () => {
  const perms = resolvePermissions("moderator");
  assert.equal(perms.includes("transparency.view"), true);
  assert.equal(hasPermission(perms, "transparency.view"), true);
  assert.equal(hasPermission(perms, "transparency"), false);
});

test("RBAC: requireAdminPermission('transparency.view') allows moderator with 'transparency.view'", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["transparency.view", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("transparency.view");
  middleware(req, res, next);

  assert.equal(called, true);
  assert.equal(res.getStatusCode(), 200);
});

test("RBAC: requireAdminPermission('transparency') rejects moderator with 403 FORBIDDEN_PERMISSION", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["transparency.view", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("transparency");
  middleware(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 403);
  const data = res.getData();
  assert.equal(data.ok, false);
  assert.equal(data.code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission('transparency') allows admin with 'transparency'", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["transparency", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("transparency");
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

  const middleware = requireAdminPermission("transparency");
  middleware(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 401);
});

test("RBAC: super admin with wildcard '*' has access to both transparency and transparency.view", () => {
  const perms = ["*"];
  assert.equal(hasPermission(perms, "transparency"), true);
  assert.equal(hasPermission(perms, "transparency.view"), true);
});
