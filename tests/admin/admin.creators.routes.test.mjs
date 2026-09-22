import test from "node:test";
import assert from "node:assert/strict";
import { requireAdminPermission } from "../../server/modules/admin/admin.permissions.js";

function createMockReqRes({ admin, query = {}, params = {}, body = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    query,
    params,
    body,
    ip,
    headers: { "user-agent": "test-agent" },
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };

  let statusCode = 200;
  let sentData = null;
  let headers = {};
  let ended = false;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      sentData = data;
      ended = true;
      return this;
    },
    setHeader(key, val) {
      headers[key] = val;
      return this;
    },
    getHeader(key) {
      return headers[key];
    },
    end() {
      ended = true;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return sentData;
    },
    isEnded() {
      return ended;
    },
  };

  return { req, res };
}

test("RBAC: requireAdminPermission('creators.view') rejects unauthenticated requests with 401", () => {
  const middleware = requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users");
  const { req, res } = createMockReqRes({ admin: undefined });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData().ok, false);
});

test("RBAC: requireAdminPermission('creators.view') rejects unauthorized roles (readonly, support, finance) with 403", () => {
  const middleware = requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users");

  const restrictedRoles = [
    { role: "readonly", permissions: ["dashboard"] },
    { role: "finance", permissions: ["dashboard", "finance", "payments"] },
    { role: "support", permissions: ["dashboard", "support"] },
  ];

  for (const admin of restrictedRoles) {
    const { req, res } = createMockReqRes({ admin });
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, `Role ${admin.role} should be blocked`);
    assert.equal(res.getStatusCode(), 403);
    assert.equal(res.getData().ok, false);
  }
});

test("RBAC: requireAdminPermission('creators.view') grants access to moderator, admin, and super_admin", () => {
  const middleware = requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users");

  const allowedRoles = [
    { role: "moderator", permissions: ["dashboard", "creators.view"] },
    { role: "admin", permissions: ["dashboard", "creators"] },
    { role: "super_admin", permissions: ["*"] },
  ];

  for (const admin of allowedRoles) {
    const { req, res } = createMockReqRes({ admin });
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, `Role ${admin.role} should have read access`);
    assert.equal(res.getStatusCode(), 200);
  }
});

test("RBAC: requireAdminPermission('creators') restricts write mutations to full admins", () => {
  const writeMiddleware = requireAdminPermission("creators", "promotions", "users");

  // Moderator should NOT be allowed to mutate creators / approve rewards
  const modAdmin = { role: "moderator", permissions: ["dashboard", "creators.view"] };
  const { req: modReq, res: modRes } = createMockReqRes({ admin: modAdmin });
  let modNext = false;
  writeMiddleware(modReq, modRes, () => {
    modNext = true;
  });
  assert.equal(modNext, false);
  assert.equal(modRes.getStatusCode(), 403);

  // Full admin should be allowed
  const fullAdmin = { role: "admin", permissions: ["dashboard", "creators"] };
  const { req: adminReq, res: adminRes } = createMockReqRes({ admin: fullAdmin });
  let adminNext = false;
  writeMiddleware(adminReq, adminRes, () => {
    adminNext = true;
  });
  assert.equal(adminNext, true);
  assert.equal(adminRes.getStatusCode(), 200);
});

test("Parameter Validation: parseIdParam boundary checks", () => {
  function parseIdParam(raw) {
    const num = parseInt(String(raw), 10);
    return Number.isInteger(num) && num > 0 ? num : null;
  }

  assert.equal(parseIdParam(123), 123);
  assert.equal(parseIdParam("456"), 456);
  assert.equal(parseIdParam("0"), null);
  assert.equal(parseIdParam("-1"), null);
  assert.equal(parseIdParam("abc"), null);
  assert.equal(parseIdParam(""), null);
  assert.equal(parseIdParam(null), null);
  assert.equal(parseIdParam(undefined), null);
  assert.equal(parseIdParam("12.34"), 12);
});
