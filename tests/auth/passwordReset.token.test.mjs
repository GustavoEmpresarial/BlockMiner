/**
 * Reset links were plain 24h JWTs: reusable until expiry, and the email announced "24 minutes"
 * because the TTL had its letters stripped. Tokens are now bound to the current password hash
 * (single use) and the email gets the real duration.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-reset-tokens-0123456789";
const svc = await import("../../server/modules/auth/auth.service.ts");

test("ttlToMinutes reads the units jsonwebtoken accepts", () => {
  assert.equal(svc.ttlToMinutes("20m", 20), 20);
  assert.equal(svc.ttlToMinutes("24h", 20), 1440);
  assert.equal(svc.ttlToMinutes("1d", 20), 1440);
  assert.equal(svc.ttlToMinutes("2 hours", 20), 120);
  assert.equal(svc.ttlToMinutes(3600, 20), 60);
  assert.equal(svc.ttlToMinutes("3600", 20), 60);
  assert.equal(svc.ttlToMinutes("garbage", 20), 20);
  assert.equal(svc.ttlToMinutes("", 15), 15);
});

test("a reset token is valid only while the password it was issued for is unchanged", () => {
  const token = svc.signPasswordResetToken(42, "$2b$10$oldhash");
  const payload = svc.verifyPasswordResetToken(token);
  assert.equal(payload.sub, "42");
  assert.equal(payload.typ, "pwd_reset");
  assert.equal(svc.isPasswordResetTokenCurrent(payload, "$2b$10$oldhash"), true);
  assert.equal(svc.isPasswordResetTokenCurrent(payload, "$2b$10$newhash"), false);
});

test("the token never carries the password hash itself", () => {
  const hash = "$2b$10$abcdefghijklmnopqrstuv";
  const token = svc.signPasswordResetToken(7, hash);
  const body = Buffer.from(token.split(".")[1], "base64url").toString();
  assert.ok(!body.includes(hash));
  assert.ok(!body.includes("abcdefghijklmnop"));
});

test("tokens without the binding (issued before this change) or tampered are refused", () => {
  assert.equal(svc.isPasswordResetTokenCurrent({ sub: "1", typ: "pwd_reset" }, "h"), false);
  assert.equal(svc.isPasswordResetTokenCurrent({ pv: "short" }, "h"), false);
  assert.equal(svc.isPasswordResetTokenCurrent(null, "h"), false);
  const token = svc.signPasswordResetToken(1, "h");
  const [a, b, c] = token.split(".");
  const forged = JSON.parse(Buffer.from(b, "base64url").toString());
  forged.sub = "2";
  assert.equal(svc.verifyPasswordResetToken(`${a}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${c}`), null);
});
