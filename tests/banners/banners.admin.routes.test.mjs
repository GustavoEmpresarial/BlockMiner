import test from "node:test";
import assert from "node:assert/strict";

const { requireAdminPermission } = await import(
  "../../server/modules/admin/admin.permissions.ts"
);
const bannersController = await import(
  "../../server/modules/banners/banners.controller.ts"
);
const { BANNER_ERROR } = await import(
  "../../server/modules/banners/banners.errors.ts"
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

// ─── RBAC Tests ─────────────────────────────────────────────────────────────

test("RBAC: requireAdminPermission('banners.view') rejects unauthenticated requests with 401", () => {
  const middleware = requireAdminPermission("banners.view", "banners", "promotions");
  const { req, res } = createMockReqRes({ admin: undefined });

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.getStatusCode(), 401);
  assert.equal(res.getData().ok, false);
});

test("RBAC: requireAdminPermission('banners.view') rejects unauthorized roles (readonly, support, finance) with 403", () => {
  const middleware = requireAdminPermission("banners.view", "banners", "promotions");

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

    assert.equal(nextCalled, false, `Role ${role} should not pass banners.view`);
    assert.equal(res.getStatusCode(), 403);
    assert.equal(res.getData().code, "FORBIDDEN_PERMISSION");
  }
});

test("RBAC: requireAdminPermission allows moderator to view banners, but denies write actions", () => {
  const viewMiddleware = requireAdminPermission("banners.view", "banners", "promotions");
  const writeMiddleware = requireAdminPermission("banners", "promotions");

  const moderatorAdmin = {
    id: 20,
    email: "mod@test.com",
    role: "moderator",
    permissions: ["dashboard", "banners.view"],
  };

  // 1. View allowed
  const { req: viewReq, res: viewRes } = createMockReqRes({ admin: moderatorAdmin });
  let viewNext = false;
  viewMiddleware(viewReq, viewRes, () => {
    viewNext = true;
  });
  assert.equal(viewNext, true, "Moderator should have access to banners.view");

  // 2. Write denied
  const { req: writeReq, res: writeRes } = createMockReqRes({ admin: moderatorAdmin });
  let writeNext = false;
  writeMiddleware(writeReq, writeRes, () => {
    writeNext = true;
  });
  assert.equal(writeNext, false, "Moderator should NOT have access to banners mutation");
  assert.equal(writeRes.getStatusCode(), 403);
});

test("RBAC: requireAdminPermission allows admin and super_admin to execute all banner operations", () => {
  const writeMiddleware = requireAdminPermission("banners", "promotions");

  const allowedRoles = [
    { id: 1, email: "super@test.com", role: "super_admin", permissions: ["*"] },
    { id: 2, email: "admin@test.com", role: "admin", permissions: ["banners", "dashboard"] },
    { id: 3, email: "legacy@test.com", role: "admin", permissions: ["promotions", "dashboard"] },
  ];

  for (const admin of allowedRoles) {
    const { req, res } = createMockReqRes({ admin });
    let nextCalled = false;
    writeMiddleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `Role ${admin.role} with perms ${admin.permissions} should pass write permission`);
  }
});

// ─── Controller Validation and Error Paths ──────────────────────────────────

test("Controller: adminCreate returns 400 when title is missing", async () => {
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "admin@test.com", role: "admin", permissions: ["banners"] },
    body: { type: "promo" },
  });

  await bannersController.adminCreate(req, res);

  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData().ok, false);
  assert.equal(res.getData().code, BANNER_ERROR.VALIDATION_ERROR);
});

test("Controller: adminUpdate returns 400 when param ID is not a positive integer", async () => {
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "admin@test.com", role: "admin", permissions: ["banners"] },
    params: { id: "invalid-id" },
    body: { title: "Updated" },
  });

  await bannersController.adminUpdate(req, res);

  assert.equal(res.getStatusCode(), 400);
  assert.equal(res.getData().ok, false);
  assert.equal(res.getData().code, BANNER_ERROR.INVALID_ID);
});

test("Controller: adminUpdate returns 404 when banner ID does not exist", async () => {
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "admin@test.com", role: "admin", permissions: ["banners"] },
    params: { id: "999999" },
    body: { title: "Updated" },
  });

  await bannersController.adminUpdate(req, res);

  assert.equal(res.getStatusCode(), 404);
  assert.equal(res.getData().ok, false);
  assert.equal(res.getData().code, BANNER_ERROR.NOT_FOUND);
});

test("Controller: adminDelete returns 404 when banner ID does not exist", async () => {
  const { req, res } = createMockReqRes({
    admin: { id: 1, email: "admin@test.com", role: "admin", permissions: ["banners"] },
    params: { id: "999999" },
  });

  await bannersController.adminDelete(req, res);

  assert.equal(res.getStatusCode(), 404);
  assert.equal(res.getData().ok, false);
  assert.equal(res.getData().code, BANNER_ERROR.NOT_FOUND);
});
