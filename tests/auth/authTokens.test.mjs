import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Unit tests for authTokens.ts (RECOVERED/@ts-nocheck, zero prior coverage) — JWT
// access-token sign/verify and opaque refresh-token create/parse.

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-authTokens-unit-tests";

const authTokens = await import("../../server/shared/security/authTokens.ts");

test("signAccessToken embeds sub/name/email/sv and the configured issuer/audience", () => {
  const token = authTokens.signAccessToken({ id: 42, name: "Alice", email: "alice@example.com", sessionVersion: 3 });
  const decoded = jwt.decode(token);
  assert.equal(decoded.sub, "42");
  assert.equal(decoded.name, "Alice");
  assert.equal(decoded.email, "alice@example.com");
  assert.equal(decoded.sv, 3);
  assert.equal(decoded.iss, authTokens.JWT_ISSUER);
  assert.equal(decoded.aud, authTokens.JWT_AUDIENCE);
  assert.ok(typeof decoded.exp === "number" && decoded.exp > Math.floor(Date.now() / 1000));
});

test("verifyAccessToken round-trips a token signed by signAccessToken", () => {
  const token = authTokens.signAccessToken({ id: 7, name: "Bob", email: "bob@example.com" });
  const verified = authTokens.verifyAccessToken(token);
  assert.equal(verified.sub, "7");
});

test("verifyAccessToken returns null (never throws) for a garbage token", () => {
  assert.equal(authTokens.verifyAccessToken("not-a-jwt"), null);
  assert.equal(authTokens.verifyAccessToken(""), null);
});

test("verifyAccessToken rejects a token signed with a different secret", () => {
  const foreign = jwt.sign({ sub: "1" }, "a-different-secret", {
    expiresIn: "1h",
    issuer: authTokens.JWT_ISSUER,
    audience: authTokens.JWT_AUDIENCE,
  });
  assert.equal(authTokens.verifyAccessToken(foreign), null);
});

test("verifyAccessToken rejects a token with the wrong issuer/audience even if signed with the right secret", () => {
  const wrongAud = jwt.sign({ sub: "1" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
    issuer: authTokens.JWT_ISSUER,
    audience: "someone-elses-app",
  });
  assert.equal(authTokens.verifyAccessToken(wrongAud), null);
});

test("signAccessToken always signs with HS256 (explicit, never left to the library default)", () => {
  const token = authTokens.signAccessToken({ id: 1, name: "X", email: "x@example.com" });
  const [headerB64] = token.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  assert.equal(header.alg, "HS256");
});

test("verifyAccessToken rejects a token signed with a different HMAC algorithm even with the right secret (2026-09-11 hardening: algorithms pinned)", () => {
  const hs512Token = jwt.sign({ sub: "1" }, process.env.JWT_SECRET, {
    algorithm: "HS512",
    expiresIn: "1h",
    issuer: authTokens.JWT_ISSUER,
    audience: authTokens.JWT_AUDIENCE,
  });
  assert.equal(authTokens.verifyAccessToken(hs512Token), null);
});

test('verifyAccessToken rejects an unsigned ("alg: none") token even with a matching payload', () => {
  const noneToken = jwt.sign({ sub: "1" }, undefined, {
    algorithm: "none",
    expiresIn: "1h",
    issuer: authTokens.JWT_ISSUER,
    audience: authTokens.JWT_AUDIENCE,
  });
  assert.equal(authTokens.verifyAccessToken(noneToken), null);
});

test("verifyAccessToken rejects an expired token", () => {
  const expired = jwt.sign({ sub: "1" }, process.env.JWT_SECRET, {
    expiresIn: -10, // already expired
    issuer: authTokens.JWT_ISSUER,
    audience: authTokens.JWT_AUDIENCE,
  });
  assert.equal(authTokens.verifyAccessToken(expired), null);
});

test("createRefreshToken: token is `${tokenId}.${secret}`, tokenHash is sha256(secret), expiresAt honors REFRESH_TOKEN_TTL_DAYS", () => {
  const rt = authTokens.createRefreshToken();
  const [tokenId, secret] = rt.token.split(".");
  assert.equal(tokenId, rt.tokenId);
  assert.equal(typeof secret, "string");
  assert.ok(secret.length > 0);
  assert.equal(rt.tokenHash.length, 64, "sha256 hex digest is 64 chars");
  const expectedMaxAgeMs = authTokens.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  const actualMaxAgeMs = rt.expiresAt - Date.now();
  assert.ok(Math.abs(actualMaxAgeMs - expectedMaxAgeMs) < 5000, "expiresAt must be ~TTL days from now");
});

test("createRefreshToken: two calls never collide (real randomness, not a fake fixed value)", () => {
  const a = authTokens.createRefreshToken();
  const b = authTokens.createRefreshToken();
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.tokenHash, b.tokenHash);
});

test("parseRefreshToken: round-trips a token from createRefreshToken, hash matches", () => {
  const rt = authTokens.createRefreshToken();
  const parsed = authTokens.parseRefreshToken(rt.token);
  assert.equal(parsed.tokenId, rt.tokenId);
  assert.equal(parsed.tokenHash, rt.tokenHash);
});

test("parseRefreshToken: returns null for malformed input (never throws)", () => {
  assert.equal(authTokens.parseRefreshToken(null), null);
  assert.equal(authTokens.parseRefreshToken(undefined), null);
  assert.equal(authTokens.parseRefreshToken(""), null);
  assert.equal(authTokens.parseRefreshToken("no-dot-here"), null);
  assert.equal(authTokens.parseRefreshToken("too.many.dots"), null);
  assert.equal(authTokens.parseRefreshToken(".missing-id"), null);
  assert.equal(authTokens.parseRefreshToken("missing-secret."), null);
});
