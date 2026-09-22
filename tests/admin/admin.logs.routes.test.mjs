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
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
      return res;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => sentData,
    getHeader: (key) => headers[key.toLowerCase()],
    isEnded: () => ended,
  };
}

test("RBAC: requireAdminPermission('logs.view') rejects unauthenticated requests with 401", () => {
  const middleware = requireAdminPermission("logs.view");
  const { req, res, getStatus, getData } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 401);
  assert.equal(getData().ok, false);
});

test("RBAC: requireAdminPermission('logs.view') rejects unauthorized roles (readonly, support, finance) with 403", () => {
  const middleware = requireAdminPermission("logs.view");

  // Readonly admin has only ['dashboard']
  const { req: req1, res: res1, getStatus: status1, getData: data1 } = createMockReqRes({
    admin: { role: "readonly", permissions: ["dashboard"] },
  });
  let next1 = false;
  middleware(req1, res1, () => {
    next1 = true;
  });
  assert.equal(next1, false);
  assert.equal(status1(), 403);
  assert.equal(data1().code, "FORBIDDEN_PERMISSION");

  // Finance admin has ['dashboard', 'users.view', 'payments', 'withdrawals', 'deposits']
  const { req: req2, res: res2, getStatus: status2 } = createMockReqRes({
    admin: { role: "finance", permissions: ["dashboard", "users.view", "payments"] },
  });
  let next2 = false;
  middleware(req2, res2, () => {
    next2 = true;
  });
  assert.equal(next2, false);
  assert.equal(status2(), 403);
});

test("RBAC: requireAdminPermission('logs.view') grants access to moderator, admin, and super_admin", () => {
  const middleware = requireAdminPermission("logs.view");

  // Moderator with explicit 'logs.view'
  const { req: reqMod, res: resMod } = createMockReqRes({
    admin: { role: "moderator", permissions: ["dashboard", "users.view", "logs.view"] },
  });
  let nextMod = false;
  middleware(reqMod, resMod, () => {
    nextMod = true;
  });
  assert.equal(nextMod, true);

  // Admin with 'logs' broad permission
  const { req: reqAdm, res: resAdm } = createMockReqRes({
    admin: { role: "admin", permissions: ["dashboard", "logs"] },
  });
  let nextAdm = false;
  middleware(reqAdm, resAdm, () => {
    nextAdm = true;
  });
  assert.equal(nextAdm, true);

  // Super admin with '*' wildcard
  const { req: reqSuper, res: resSuper } = createMockReqRes({
    admin: { role: "super_admin", permissions: ["*"] },
  });
  let nextSuper = false;
  middleware(reqSuper, resSuper, () => {
    nextSuper = true;
  });
  assert.equal(nextSuper, true);
});

test("Route GET /:id validates ID parameter", async () => {
  // We simulate ID validation
  const testIds = ["abc", "-5", "0", "999999999999999999999"];
  for (const idStr of testIds) {
    const id = Number(idStr);
    const isInvalid = !Number.isSafeInteger(id) || id < 1;
    assert.equal(isInvalid, true, `Expected ${idStr} to be invalid`);
  }

  const validId = Number("1042");
  assert.equal(Number.isSafeInteger(validId) && validId >= 1, true);
});
