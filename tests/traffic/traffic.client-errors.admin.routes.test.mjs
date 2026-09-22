import test from "node:test";
import assert from "node:assert/strict";
import { requireAdminPermission } from "../../server/modules/admin/admin.permissions.js";

function createMockReqRes({ admin, query = {}, body = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    query,
    body,
    ip,
    headers: { "user-agent": "test-agent" },
  };

  let statusCode = 200;
  let sentData = null;
  let ended = false;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      sentData = data;
      ended = true;
      return res;
    },
    send(data) {
      sentData = data;
      ended = true;
      return res;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => sentData,
    isEnded: () => ended,
  };
}

test("RBAC: requireAdminPermission('logs.view') rejects unauthenticated request with 401", () => {
  const middleware = requireAdminPermission("logs.view");
  const { req, res, getStatus } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 401);
});

test("RBAC: requireAdminPermission('logs.view') rejects admin with only 'support' with 403", () => {
  const middleware = requireAdminPermission("logs.view");
  const { req, res, getStatus, getData } = createMockReqRes({
    admin: {
      adminId: 10,
      email: "support@blockminer.space",
      role: "support",
      permissions: ["support"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
  assert.equal(getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission('logs.view') permits moderator with 'logs.view'", () => {
  const middleware = requireAdminPermission("logs.view");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 5,
      email: "mod@blockminer.space",
      role: "moderator",
      permissions: ["dashboard", "logs.view"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("RBAC: requireAdminPermission('logs.view') permits admin with parent permission 'logs'", () => {
  const middleware = requireAdminPermission("logs.view");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 2,
      email: "admin@blockminer.space",
      role: "admin",
      permissions: ["dashboard", "logs"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("RBAC: requireAdminPermission('logs') rejects moderator who only has 'logs.view'", () => {
  const middleware = requireAdminPermission("logs");
  const { req, res, getStatus, getData } = createMockReqRes({
    admin: {
      adminId: 5,
      email: "mod@blockminer.space",
      role: "moderator",
      permissions: ["dashboard", "logs.view"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
  assert.equal(getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission('logs') permits super_admin with wildcard '*'", () => {
  const middleware = requireAdminPermission("logs");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 1,
      email: "super@blockminer.space",
      role: "super_admin",
      permissions: ["*"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
