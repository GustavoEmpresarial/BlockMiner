import test from "node:test";
import assert from "node:assert/strict";

// Unit tests for token.ts — cookie parsing and token extraction, zero prior coverage.
const token = await import("../../server/shared/security/token.ts");

const FAKE_JWT = "aaa.bbb.ccc";

function req(cookie, authorization) {
  return { headers: { cookie, authorization } };
}

test("getTokenFromRequest: prefers the access cookie over everything else", () => {
  const r = req(`${token.ACCESS_COOKIE_NAME}=fromcookie; other=1`, `Bearer ${FAKE_JWT}`);
  assert.equal(token.getTokenFromRequest(r), "fromcookie");
});

test("getTokenFromRequest: falls back to the legacy session cookie name", () => {
  const r = req(`${token.LEGACY_SESSION_COOKIE}=legacyvalue`);
  assert.equal(token.getTokenFromRequest(r), "legacyvalue");
});

test("getTokenFromRequest: falls back to a Bearer header that looks like a JWT (3 non-empty dot-separated parts)", () => {
  const r = req(undefined, `Bearer ${FAKE_JWT}`);
  assert.equal(token.getTokenFromRequest(r), FAKE_JWT);
});

test("getTokenFromRequest: rejects a Bearer value that doesn't look like a JWT", () => {
  assert.equal(token.getTokenFromRequest(req(undefined, "Bearer not-a-jwt")), null);
  assert.equal(token.getTokenFromRequest(req(undefined, "Bearer a..c")), null, "empty middle segment must be rejected");
  assert.equal(token.getTokenFromRequest(req(undefined, "Bearer a.b")), null, "only 2 segments must be rejected");
});

test("getTokenFromRequest: case-insensitive 'bearer' prefix", () => {
  const r = req(undefined, `bearer ${FAKE_JWT}`);
  assert.equal(token.getTokenFromRequest(r), FAKE_JWT);
});

test("getTokenFromRequest: null when there's no cookie and no auth header", () => {
  assert.equal(token.getTokenFromRequest(req()), null);
});

test("getTokenFromRequest: URL-decodes cookie values", () => {
  const r = req(`${token.ACCESS_COOKIE_NAME}=${encodeURIComponent("a=b&c")}`);
  assert.equal(token.getTokenFromRequest(r), "a=b&c");
});

test("getRefreshTokenFromRequest: reads only the refresh cookie, ignores everything else", () => {
  assert.equal(token.getRefreshTokenFromRequest(req(`${token.REFRESH_COOKIE_NAME}=rt123; other=x`)), "rt123");
  assert.equal(token.getRefreshTokenFromRequest(req(`${token.ACCESS_COOKIE_NAME}=at123`)), null);
  assert.equal(token.getRefreshTokenFromRequest(req()), null);
});

test("getAdminTokenFromRequest: prefers the admin session cookie, falls back to a JWT-shaped Bearer header", () => {
  assert.equal(token.getAdminTokenFromRequest(req(`${token.ADMIN_SESSION_COOKIE}=admincookie`)), "admincookie");
  assert.equal(token.getAdminTokenFromRequest(req(undefined, `Bearer ${FAKE_JWT}`)), FAKE_JWT);
  assert.equal(token.getAdminTokenFromRequest(req()), null);
});

test("cookie parsing: multiple cookies with spacing/semicolons are all readable independently", () => {
  const r = req(`a=1;  ${token.ACCESS_COOKIE_NAME}=tok ;  b=2`);
  assert.equal(token.getTokenFromRequest(r), "tok");
});
