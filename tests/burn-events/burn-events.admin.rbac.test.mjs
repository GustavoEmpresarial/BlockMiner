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

test("RBAC: admin role default permissions include 'burn_events'", () => {
  const perms = resolvePermissions("admin");
  assert.equal(perms.includes("burn_events"), true);
  assert.equal(hasPermission(perms, "burn_events"), true);
  assert.equal(hasPermission(perms, "burn_events.view"), true);
});

test("RBAC: moderator role default permissions include 'burn_events.view'", () => {
  const perms = resolvePermissions("moderator");
  assert.equal(perms.includes("burn_events.view"), true);
  assert.equal(hasPermission(perms, "burn_events.view"), true);
  assert.equal(hasPermission(perms, "burn_events"), false);
});

test("RBAC: requireAdminPermission('burn_events.view') allows moderator with 'burn_events.view'", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["burn_events.view", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("burn_events.view");
  middleware(req, res, next);

  assert.equal(called, true);
  assert.equal(res.getStatusCode(), 200);
});

test("RBAC: requireAdminPermission('burn_events') rejects moderator with 403 FORBIDDEN_PERMISSION", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 2, role: "moderator", permissions: ["burn_events.view", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("burn_events");
  middleware(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 403);
  const data = res.getData();
  assert.equal(data.ok, false);
  assert.equal(data.code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission('burn_events') allows admin with 'burn_events'", () => {
  const { req, res } = createMockReqRes({
    admin: { adminId: 1, role: "admin", permissions: ["burn_events", "dashboard"] },
  });
  let called = false;
  const next = () => {
    called = true;
  };

  const middleware = requireAdminPermission("burn_events");
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

  const middleware = requireAdminPermission("burn_events");
  middleware(req, res, next);

  assert.equal(called, false);
  assert.equal(res.getStatusCode(), 401);
});

test("RBAC: super admin with wildcard '*' has access to both burn_events and burn_events.view", () => {
  const perms = ["*"];
  assert.equal(hasPermission(perms, "burn_events"), true);
  assert.equal(hasPermission(perms, "burn_events.view"), true);
});
