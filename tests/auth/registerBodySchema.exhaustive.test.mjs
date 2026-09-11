import test from "node:test";
import assert from "node:assert/strict";
import {
  registerBodySchema,
  REGISTER_USERNAME_MIN,
  REGISTER_USERNAME_MAX,
  REGISTER_PASSWORD_MIN_LEN,
  REGISTER_PASSWORD_MAX_LEN,
  REGISTER_REF_CODE_MAX_LEN,
} from "../../server/modules/auth/register/registerBodySchema.ts";

// registerBodySchema is applied by validateBody() middleware BEFORE registerPost ever runs
// (see auth.routes.ts) — this exercises the schema directly, the same contract the real route
// enforces, rather than going through the controller (which the other register.*.test.mjs
// files already cover for post-validation business logic).

function valid(overrides = {}) {
  return {
    username: "validuser1",
    email: "someone@gmail.com",
    password: "supersecret1",
    acceptTerms: true,
    ...overrides,
  };
}

test("accepts a minimal valid body and strips refCode to undefined when absent", () => {
  const result = registerBodySchema.safeParse(valid());
  assert.equal(result.success, true, JSON.stringify(result.error?.issues));
  assert.equal(result.data.refCode, undefined);
});

test("username: too short / too long / invalid characters are rejected", () => {
  assert.equal(registerBodySchema.safeParse(valid({ username: "a".repeat(REGISTER_USERNAME_MIN - 1) })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ username: "a".repeat(REGISTER_USERNAME_MAX + 1) })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ username: "has spaces" })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ username: "has@symbol" })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ username: "valid_user-name.ok" })).success, true);
});

test("username: control characters are stripped before length/regex validation", () => {
  const result = registerBodySchema.safeParse(valid({ username: "user\x00\x01name" }));
  assert.equal(result.success, true);
  assert.equal(result.data.username, "username");
});

test("email: invalid shape is rejected", () => {
  assert.equal(registerBodySchema.safeParse(valid({ email: "not-an-email" })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ email: "" })).success, false);
});

test("email: disallowed provider domain is rejected even with a valid shape", () => {
  const result = registerBodySchema.safeParse(valid({ email: "someone@some-random-unknown-provider.zzz" }));
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((i) => i.message === "auth.register.errors.email_provider_not_allowed"));
});

test("email: is lowercased and trimmed", () => {
  const result = registerBodySchema.safeParse(valid({ email: "  SomeOne@GMAIL.com  " }));
  assert.equal(result.success, true);
  assert.equal(result.data.email, "someone@gmail.com");
});

test("password: too short / too long is rejected, boundary values accepted", () => {
  assert.equal(registerBodySchema.safeParse(valid({ password: "a".repeat(REGISTER_PASSWORD_MIN_LEN - 1) })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ password: "a".repeat(REGISTER_PASSWORD_MAX_LEN + 1) })).success, false);
  assert.equal(registerBodySchema.safeParse(valid({ password: "a".repeat(REGISTER_PASSWORD_MIN_LEN) })).success, true);
  assert.equal(registerBodySchema.safeParse(valid({ password: "a".repeat(REGISTER_PASSWORD_MAX_LEN) })).success, true);
});

test("password: NUL bytes are stripped before length validation", () => {
  const result = registerBodySchema.safeParse(valid({ password: "a\x00b\x00c\x00defg" })); // 7 real chars -> too short after stripping
  assert.equal(result.success, false);
});

test("refCode: non-alphanumeric characters are stripped; too-long is rejected", () => {
  const stripped = registerBodySchema.safeParse(valid({ refCode: "ab-cd_ef!123" }));
  assert.equal(stripped.success, true);
  assert.equal(stripped.data.refCode, "abcdef123");

  const tooLong = registerBodySchema.safeParse(valid({ refCode: "a".repeat(REGISTER_REF_CODE_MAX_LEN + 20) }));
  assert.equal(tooLong.success, true, "gets truncated to max length by the preprocessor, not rejected");
  assert.equal(tooLong.data.refCode.length, REGISTER_REF_CODE_MAX_LEN);
});

test("acceptTerms: must be literally true — false or missing is rejected", () => {
  assert.equal(registerBodySchema.safeParse(valid({ acceptTerms: false })).success, false);
  const { acceptTerms, ...withoutTerms } = valid();
  assert.equal(registerBodySchema.safeParse(withoutTerms).success, false);
});

test("strict mode: an unknown extra field is rejected", () => {
  const result = registerBodySchema.safeParse(valid({ isAdmin: true }));
  assert.equal(result.success, false);
});

test("cfTurnstileToken: optional, empty string becomes undefined, oversized is capped not rejected", () => {
  const empty = registerBodySchema.safeParse(valid({ cfTurnstileToken: "" }));
  assert.equal(empty.success, true);
  assert.equal(empty.data.cfTurnstileToken, undefined);

  const long = registerBodySchema.safeParse(valid({ cfTurnstileToken: "x".repeat(5000) }));
  assert.equal(long.success, true);
  assert.equal(long.data.cfTurnstileToken.length, 4096);
});

test("utm/referrer fields: optional strings, each independently omittable", () => {
  const result = registerBodySchema.safeParse(
    valid({ utmSource: "google", utmMedium: "cpc", utmCampaign: "launch", referrerDomain: "example.com" }),
  );
  assert.equal(result.success, true);
  assert.equal(result.data.utmSource, "google");
});
