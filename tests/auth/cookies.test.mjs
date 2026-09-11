import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Unit tests for cookies.ts (RECOVERED/@ts-nocheck, zero prior coverage) — the security
// boundary for how auth/admin session cookies are built (flags per env/SameSite) plus the
// documented Set-Cookie-overwrite bug fix (appendSetCookie) and the admin-secret comparator.

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-cookies-unit-tests";

const cookies = await import("../../server/shared/security/cookies.ts");
const authTokens = await import("../../server/shared/security/authTokens.ts");

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("buildCookie: defaults to SameSite=Lax when AUTH_COOKIE_SAMESITE is unset", () => {
  withEnv({ AUTH_COOKIE_SAMESITE: undefined, NODE_ENV: "development" }, () => {
    const c = cookies.buildCookie("x", "v", 60);
    assert.match(c, /SameSite=Lax/);
    assert.doesNotMatch(c, /Partitioned/);
  });
});

test("buildCookie: SameSite=None always appends Secure and Partitioned, regardless of NODE_ENV", () => {
  withEnv({ AUTH_COOKIE_SAMESITE: "none", NODE_ENV: "development" }, () => {
    const c = cookies.buildCookie("x", "v", 60);
    assert.match(c, /SameSite=None/);
    assert.match(c, /Secure/);
    assert.match(c, /Partitioned/);
  });
});

test("buildCookie: SameSite=Strict/Lax only get Secure in production", () => {
  withEnv({ AUTH_COOKIE_SAMESITE: "strict", NODE_ENV: "development" }, () => {
    assert.doesNotMatch(cookies.buildCookie("x", "v", 60), /Secure/);
  });
  withEnv({ AUTH_COOKIE_SAMESITE: "strict", NODE_ENV: "production" }, () => {
    assert.match(cookies.buildCookie("x", "v", 60), /Secure/);
  });
});

test("buildCookie: always sets HttpOnly, Path=/, and the given Max-Age", () => {
  const c = cookies.buildCookie("mycookie", "myvalue", 3600);
  assert.match(c, /HttpOnly/);
  assert.match(c, /Path=\//);
  assert.match(c, /Max-Age=3600/);
  assert.match(c, /^mycookie=myvalue;/);
});

test("buildCookie: URL-encodes the cookie value", () => {
  const c = cookies.buildCookie("x", "a b;c", 60);
  assert.match(c, new RegExp(`x=${encodeURIComponent("a b;c")}`));
});

test("buildAccessCookie: Max-Age reflects the real JWT exp claim, not a hardcoded number", () => {
  // ACCESS_TOKEN_TTL is captured into a module-level const at import time in authTokens.ts,
  // so it can't be overridden per-test after the module is already loaded — assert against
  // the token's own decoded `exp` claim instead of assuming a specific TTL value.
  const token = authTokens.signAccessToken({ id: 1, name: "A", email: "a@b.com" });
  const decoded = jwt.decode(token);
  const expectedMaxAge = decoded.exp - Math.floor(Date.now() / 1000);
  const c = cookies.buildAccessCookie(token);
  const match = c.match(/Max-Age=(\d+)/);
  assert.ok(match);
  const maxAge = Number(match[1]);
  assert.ok(Math.abs(maxAge - expectedMaxAge) <= 2, `expected ~${expectedMaxAge}s (from the token's exp claim), got ${maxAge}`);
});

test("buildRefreshCookie: Max-Age is derived from expiresAt, floored at 0 for an already-expired timestamp", () => {
  const c1 = cookies.buildRefreshCookie("tok", Date.now() + 60_000);
  const m1 = Number(c1.match(/Max-Age=(\d+)/)[1]);
  assert.ok(m1 > 55 && m1 <= 60);

  const c2 = cookies.buildRefreshCookie("tok", Date.now() - 60_000);
  assert.match(c2, /Max-Age=0/);
});

test("clearAuthCookies: returns exactly 2 cookies, both Max-Age=0", () => {
  const cleared = cookies.clearAuthCookies();
  assert.equal(cleared.length, 2);
  for (const c of cleared) assert.match(c, /Max-Age=0/);
});

test("clearAccessCookieOnly: returns a single Max-Age=0 cookie", () => {
  assert.match(cookies.clearAccessCookieOnly(), /Max-Age=0/);
});

test("appendSetCookie: preserves an existing Set-Cookie header instead of overwriting it (the documented CSRF-cookie-loss bug fix)", () => {
  const headers = {};
  const res = {
    getHeader: (name) => headers[name],
    setHeader: (name, value) => {
      headers[name] = value;
    },
  };
  res.setHeader("Set-Cookie", "existing=1; Path=/");
  cookies.appendSetCookie(res, "new=2; Path=/");
  assert.deepEqual(headers["Set-Cookie"], ["existing=1; Path=/", "new=2; Path=/"]);
});

test("appendSetCookie: works when nothing was set yet, and accepts an array of cookies to add", () => {
  const headers = {};
  const res = {
    getHeader: (name) => headers[name],
    setHeader: (name, value) => {
      headers[name] = value;
    },
  };
  cookies.appendSetCookie(res, ["a=1", "b=2"]);
  assert.deepEqual(headers["Set-Cookie"], ["a=1", "b=2"]);
});

test("timingSafeAdminSecretEqual: true only for an exact match, false for empty/undefined expected", () => {
  assert.equal(cookies.timingSafeAdminSecretEqual("secret123", "secret123"), true);
  assert.equal(cookies.timingSafeAdminSecretEqual("wrong", "secret123"), false);
  assert.equal(cookies.timingSafeAdminSecretEqual("secret123", ""), false);
  assert.equal(cookies.timingSafeAdminSecretEqual("secret123", undefined), false);
  assert.equal(cookies.timingSafeAdminSecretEqual(undefined, "secret123"), false);
});
