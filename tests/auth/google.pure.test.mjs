import test from "node:test";
import assert from "node:assert/strict";

const {
  sanitizeGoogleUsername,
  parseGoogleUserInfo,
  pickGoogleDisplayName,
} = await import("../../server/modules/auth/google/google.pure.ts");

test("sanitizeGoogleUsername keeps safe slug", () => {
  assert.equal(sanitizeGoogleUsername("Jane_Doe-BR!"), "jane_doe_br");
  assert.ok(sanitizeGoogleUsername("ab").startsWith("g_"));
});

test("parseGoogleUserInfo requires sub and normalizes email", () => {
  assert.equal(parseGoogleUserInfo(null), null);
  const info = parseGoogleUserInfo({
    sub: "google-sub-123",
    email: "  Foo@Bar.COM ",
    email_verified: true,
    name: "Jane Doe",
    picture: "https://example.com/p.jpg",
  });
  assert.equal(info?.sub, "google-sub-123");
  assert.equal(info?.email, "foo@bar.com");
  assert.equal(info?.email_verified, true);
  assert.equal(pickGoogleDisplayName(info), "Jane Doe");
});
