/**
 * CSRF regression guard for the /inventory surface. No CSRF test existed anywhere
 * in this codebase before this pass — this exercises the real double-submit-cookie
 * middleware (server/core/http/middleware/csrf.ts) directly against a fake
 * req/res, confirming:
 *  1. POST /api/rooms/* and /api/inventory/* are NOT in the exempt-prefix list
 *     (a silent addition there would strip CSRF protection from every
 *     install/uninstall/buy/dismantle mutation without anyone noticing).
 *  2. A mutating request with a missing or mismatched X-CSRF-Token header is
 *     rejected with 403 INVALID_CSRF_TOKEN.
 *  3. A mutating request with the correct token (matching the csrf cookie) passes.
 *  4. GET requests are never blocked, even without a token.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCsrfMiddleware, CSRF_COOKIE_NAME } from "../../server/core/http/middleware/csrf.ts";

function fakeReq({ method, url, cookie, csrfHeader }) {
  return {
    method,
    url,
    originalUrl: url,
    headers: {
      cookie,
      ...(csrfHeader !== undefined ? { "x-csrf-token": csrfHeader } : {}),
    },
  };
}

function fakeRes() {
  const calls = { status: null, json: null, headers: {} };
  return {
    calls,
    locals: {},
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
    getHeader(name) {
      return calls.headers[name];
    },
    setHeader(name, value) {
      calls.headers[name] = value;
    },
  };
}

function run(middleware, req, res) {
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return nextCalled;
}

test("POST /api/rooms/rack/install and /api/inventory routes are protected, not in the CSRF-exempt list", () => {
  const middleware = createCsrfMiddleware();
  const req = fakeReq({ method: "POST", url: "/api/rooms/rack/install" });
  const res = fakeRes();
  const nextCalled = run(middleware, req, res);
  assert.equal(nextCalled, false, "an unauthenticated-looking POST with no CSRF token must be rejected, not exempted");
  assert.equal(res.calls.status, 403);
  assert.equal(res.calls.json.code, "INVALID_CSRF_TOKEN");
});

test("rejects a mutating request with no X-CSRF-Token header", () => {
  const middleware = createCsrfMiddleware();
  const req = fakeReq({ method: "POST", url: "/api/inventory/install", cookie: `${CSRF_COOKIE_NAME}=abcdefghijklmnopqrstuvwx` });
  const res = fakeRes();
  const nextCalled = run(middleware, req, res);
  assert.equal(nextCalled, false);
  assert.equal(res.calls.status, 403);
  assert.equal(res.calls.json.code, "INVALID_CSRF_TOKEN");
});

test("rejects a mutating request whose X-CSRF-Token does not match the cookie (forged/stale token)", () => {
  const middleware = createCsrfMiddleware();
  const req = fakeReq({
    method: "POST",
    url: "/api/rooms/buy",
    cookie: `${CSRF_COOKIE_NAME}=abcdefghijklmnopqrstuvwx`,
    csrfHeader: "totally-different-token",
  });
  const res = fakeRes();
  const nextCalled = run(middleware, req, res);
  assert.equal(nextCalled, false);
  assert.equal(res.calls.status, 403);
});

test("allows a mutating request whose X-CSRF-Token matches the cookie exactly", () => {
  const middleware = createCsrfMiddleware();
  const token = "abcdefghijklmnopqrstuvwx";
  const req = fakeReq({ method: "POST", url: "/api/rooms/rack/uninstall", cookie: `${CSRF_COOKIE_NAME}=${token}`, csrfHeader: token });
  const res = fakeRes();
  const nextCalled = run(middleware, req, res);
  assert.equal(nextCalled, true);
  assert.equal(res.calls.status, null, "must not have written any error response");
});

test("never blocks a GET request, even with no CSRF token at all", () => {
  const middleware = createCsrfMiddleware();
  const req = fakeReq({ method: "GET", url: "/api/inventory" });
  const res = fakeRes();
  const nextCalled = run(middleware, req, res);
  assert.equal(nextCalled, true);
  assert.equal(res.calls.status, null);
});

test("PUT/PATCH/DELETE are treated as mutating too (not just POST)", () => {
  const middleware = createCsrfMiddleware();
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const req = fakeReq({ method, url: "/api/rooms/rack/install" });
    const res = fakeRes();
    const nextCalled = run(middleware, req, res);
    assert.equal(nextCalled, false, `${method} must require a valid CSRF token too`);
    assert.equal(res.calls.status, 403);
  }
});
