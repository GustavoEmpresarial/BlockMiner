/**
 * Unit: the CSRF middleware does not issue its cookie on static files (so Cloudflare can cache
 * them) but keeps issuing it on HTML/API and keeps rejecting unsafe methods without a token.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { createCsrfMiddleware, isStaticFileRequest, CSRF_COOKIE_NAME } = await import(
  "../../server/core/http/middleware/csrf.ts"
);

function run(method, url, cookie, headers = {}) {
  const headersOut = {};
  let status = 200;
  let body;
  let nextCalled = false;
  const req = { method, url, originalUrl: url, headers: { ...(cookie ? { cookie } : {}), ...headers }, ip: "203.0.113.9", get: () => undefined };
  const res = {
    locals: {},
    getHeader: (k) => headersOut[k.toLowerCase()],
    setHeader: (k, v) => {
      headersOut[k.toLowerCase()] = v;
    },
    status(c) {
      status = c;
      return this;
    },
    json(b) {
      body = b;
      return this;
    },
  };
  createCsrfMiddleware()(req, res, () => {
    nextCalled = true;
  });
  return { setCookie: headersOut["set-cookie"], status, body, nextCalled, token: res.locals.csrfToken };
}

test("static GET/HEAD files get no Set-Cookie", () => {
  for (const url of ["/assets/index-D0VXgP-n.js", "/assets/index.css?v=2", "/media/racks/default-8slot.svg", "/models/miner.glb", "/favicon.ico"]) {
    for (const m of ["GET", "HEAD"]) {
      const r = run(m, url);
      assert.equal(r.setCookie, undefined, `${m} ${url}`);
      assert.equal(r.nextCalled, true);
    }
  }
});

test("HTML, SPA routes and API responses still issue the cookie", () => {
  for (const url of ["/", "/dashboard", "/index.html", "/api/tournaments", "/api/files/report.js", "/socket.io/x.js"]) {
    const r = run("GET", url);
    assert.ok(String(r.setCookie).startsWith(`${CSRF_COOKIE_NAME}=`), url);
  }
});

test("unsafe methods are still rejected without a token, even on a static-looking path", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    const r = run(m, "/assets/evil.js");
    assert.equal(r.status, 403, m);
    assert.equal(r.body.code, "INVALID_CSRF_TOKEN");
    assert.equal(r.nextCalled, false);
  }
  const tok = "a".repeat(32);
  const ok = run("POST", "/api/mining/allocation", `${CSRF_COOKIE_NAME}=${tok}`, { "x-csrf-token": tok });
  assert.equal(ok.nextCalled, true);
});

test("an existing cookie is reused and never re-issued", () => {
  const tok = "b".repeat(32);
  const r = run("GET", "/api/tournaments", `${CSRF_COOKIE_NAME}=${tok}`);
  assert.equal(r.setCookie, undefined);
  assert.equal(r.token, tok);
});

test("isStaticFileRequest edge cases", () => {
  assert.equal(isStaticFileRequest("GET", "/assets/a.js#frag"), true);
  assert.equal(isStaticFileRequest("POST", "/assets/a.js"), false);
  assert.equal(isStaticFileRequest("GET", "/api/x.png"), false);
  assert.equal(isStaticFileRequest("GET", "/assets/a.js.html"), false);
  assert.equal(isStaticFileRequest("GET", "/download?file=a.js"), false);
});
