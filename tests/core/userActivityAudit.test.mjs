import test from "node:test";
import assert from "node:assert/strict";

const {
  buildUserApiActivityAction,
  shouldAuditUserRequest,
} = await import("../../server/core/http/middleware/userActivityAudit.policy.ts");

test("buildUserApiActivityAction sanitizes ids and hashes in path", () => {
  assert.equal(
    buildUserApiActivityAction("POST", "/api/rooms/rack/install"),
    "USER_API_POST_ROOMS_RACK_INSTALL",
  );
  assert.equal(
    buildUserApiActivityAction("GET", "/api/users/12345/profile"),
    "USER_API_GET_USERS_ID_PROFILE",
  );
  assert.equal(
    buildUserApiActivityAction("DELETE", "/api/vault/abcdef0123456789abcdef01"),
    "USER_API_DELETE_VAULT_HASH",
  );
});

test("shouldAuditUserRequest requires authenticated user", () => {
  const res = { statusCode: 200 };
  assert.equal(shouldAuditUserRequest({ method: "POST", originalUrl: "/api/x" }, res), false);
  assert.equal(
    shouldAuditUserRequest(
      { method: "POST", originalUrl: "/api/x", user: { id: 7 } },
      res,
    ),
    true,
  );
});

test("shouldAuditUserRequest skips heartbeat / admin / 5xx by default", () => {
  const userReq = (path, method = "GET") => ({
    method,
    originalUrl: path,
    user: { id: 1 },
  });
  assert.equal(
    shouldAuditUserRequest(userReq("/api/session/heartbeat"), { statusCode: 200 }),
    false,
  );
  assert.equal(
    shouldAuditUserRequest(userReq("/api/admin/users"), { statusCode: 200 }),
    false,
  );
  assert.equal(
    shouldAuditUserRequest(userReq("/api/wallet/balance", "POST"), { statusCode: 500 }),
    false,
  );
});

test("shouldAuditUserRequest respects USER_ACTIVITY_LOG_READS=0 for GET", () => {
  const prev = process.env.USER_ACTIVITY_LOG_READS;
  process.env.USER_ACTIVITY_LOG_READS = "0";
  try {
    assert.equal(
      shouldAuditUserRequest(
        { method: "GET", originalUrl: "/api/wallet/balance", user: { id: 1 } },
        { statusCode: 200 },
      ),
      false,
    );
    assert.equal(
      shouldAuditUserRequest(
        { method: "POST", originalUrl: "/api/wallet/withdraw", user: { id: 1 } },
        { statusCode: 200 },
      ),
      true,
    );
  } finally {
    if (prev === undefined) delete process.env.USER_ACTIVITY_LOG_READS;
    else process.env.USER_ACTIVITY_LOG_READS = prev;
  }
});
