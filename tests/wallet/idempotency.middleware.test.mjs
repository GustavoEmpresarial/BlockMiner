import test from "node:test";
import assert from "node:assert/strict";

const { requireCriticalIdempotency } = await import("../../server/core/http/middleware/idempotency.ts");

function fakeReqRes({ headers = {}, body = {} } = {}) {
  const req = {
    get: (name) => headers[name.toLowerCase()] ?? headers[name],
    body,
    params: {},
    path: "/x",
  };
  let statusCode = null;
  let jsonBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
  };
  return { req, res, getStatus: () => statusCode, getJson: () => jsonBody };
}

test("requireCriticalIdempotency rejects a missing Idempotency-Key with 400", () => {
  const { req, res, getStatus, getJson } = fakeReqRes();
  let nextCalled = false;
  requireCriticalIdempotency({ scope: "test_scope" })(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 400);
  assert.equal(getJson().ok, false);
});

test("requireCriticalIdempotency rejects a too-short key", () => {
  const { req, res, getStatus } = fakeReqRes({ headers: { "idempotency-key": "abc" } });
  let nextCalled = false;
  requireCriticalIdempotency({ scope: "test_scope" })(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 400);
});

test("requireCriticalIdempotency accepts a valid key and attaches req.criticalIdempotency", () => {
  const { req, res } = fakeReqRes({ headers: { "idempotency-key": "a-valid-key-123456" } });
  let nextCalled = false;
  requireCriticalIdempotency({ scope: "test_scope" })(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(req.criticalIdempotency.scope, "test_scope");
  assert.equal(req.criticalIdempotency.idempotencyKey, "a-valid-key-123456");
  assert.equal(typeof req.criticalIdempotency.requestHash, "string");
});
