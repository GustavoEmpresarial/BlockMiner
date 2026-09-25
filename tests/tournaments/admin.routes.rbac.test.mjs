import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);

function createMockReqRes({
  admin,
  query = {},
  params = {},
  body = {},
  ip = "127.0.0.1",
} = {}) {
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

test("RBAC: requireAdminPermission('tournaments.view') rejects unauthenticated requests with 401", () => {
  const middleware = requireAdminPermission("tournaments.view", "tournaments");
  const { req, res } = createMockReqRes({ admin: undefined });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData().ok, false);
});

test("RBAC: requireAdminPermission('tournaments') rejects restricted roles with 403", () => {
  const middleware = requireAdminPermission("tournaments");

  const restrictedRoles = [
    { role: "readonly", permissions: ["dashboard"] },
    { role: "finance", permissions: ["dashboard", "finance", "payments"] },
    { role: "support", permissions: ["dashboard", "support"] },
  ];

  for (const { role, permissions } of restrictedRoles) {
    const { req, res } = createMockReqRes({
      admin: { id: 10, email: `${role}@test.com`, role, permissions },
    });
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, `Role ${role} should not pass tournaments write`);
    assert.equal(res.getStatusCode(), 403);
    assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
  }
});

test("RBAC: moderator can access tournaments.view (GET) but is denied on tournaments mutations (POST/PATCH)", () => {
  const viewMiddleware = requireAdminPermission("tournaments.view", "tournaments");
  const writeMiddleware = requireAdminPermission("tournaments");

  const moderator = {
    id: 20,
    email: "mod@test.com",
    role: "moderator",
    permissions: ["dashboard", "tournaments.view"],
  };

  // 1. View allowed
  const { req: viewReq, res: viewRes } = createMockReqRes({ admin: moderator });
  let viewNext = false;
  viewMiddleware(viewReq, viewRes, () => {
    viewNext = true;
  });
  assert.equal(viewNext, true, "Moderator should have access to tournaments.view");

  // 2. Write denied
  const { req: writeReq, res: writeRes } = createMockReqRes({ admin: moderator });
  let writeNext = false;
  writeMiddleware(writeReq, writeRes, () => {
    writeNext = true;
  });
  assert.equal(writeNext, false, "Moderator should NOT have access to tournaments mutation");
  assert.equal(writeRes.getStatusCode(), 403);
  assert.equal(writeRes.getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC: admin and super_admin roles have full access to both tournaments.view and tournaments write", () => {
  const writeMiddleware = requireAdminPermission("tournaments");

  const allowedRoles = [
    { id: 1, email: "super@test.com", role: "super_admin", permissions: ["*"] },
    { id: 2, email: "admin@test.com", role: "admin", permissions: ["tournaments", "dashboard"] },
  ];

  for (const admin of allowedRoles) {
    const { req, res } = createMockReqRes({ admin });
    let nextCalled = false;
    writeMiddleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `Role ${admin.role} should have write access`);
  }
});
