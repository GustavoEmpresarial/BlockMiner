import test from "node:test";
import assert from "node:assert/strict";

const { getTokenFromRequest, getRefreshTokenFromRequest, ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } = await import(
  "../../server/shared/security/token.ts"
);

function fakeReq(cookieHeader, authHeader) {
  return { headers: { cookie: cookieHeader, authorization: authHeader } };
}

test("getTokenFromRequest reads the access cookie", () => {
  const req = fakeReq(`${ACCESS_COOKIE_NAME}=abc.def.ghi`);
  assert.equal(getTokenFromRequest(req), "abc.def.ghi");
});

test("getTokenFromRequest falls back to a JWT-shaped Bearer header", () => {
  const req = fakeReq(undefined, "Bearer abc.def.ghi");
  assert.equal(getTokenFromRequest(req), "abc.def.ghi");
});

test("getTokenFromRequest ignores a non-JWT-shaped Bearer header", () => {
  const req = fakeReq(undefined, "Bearer not-a-jwt");
  assert.equal(getTokenFromRequest(req), null);
});

test("getRefreshTokenFromRequest reads the refresh cookie only", () => {
  const req = fakeReq(`${REFRESH_COOKIE_NAME}=uuid.secret`);
  assert.equal(getRefreshTokenFromRequest(req), "uuid.secret");
});
