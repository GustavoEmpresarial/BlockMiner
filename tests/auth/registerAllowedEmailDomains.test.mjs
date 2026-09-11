import test from "node:test";
import assert from "node:assert/strict";
import {
  isRegisterAllowedEmailDomain,
  registerEmailDomain,
  REGISTER_ALLOWED_EMAIL_DOMAINS,
} from "../../server/modules/auth/register/registerAllowedEmailDomains.ts";

// The client-side registerAllowedEmailDomains.ts is intentionally a permissive stub
// (`return true`, documented in its own header) — the server list below is the actual
// enforcement gate, so this tests that directly rather than a nonexistent "parity" with a
// client copy that never tried to duplicate it.

test("registerEmailDomain: extracts and lowercases the host after the last '@'", () => {
  assert.equal(registerEmailDomain("Someone@GMAIL.com"), "gmail.com");
  assert.equal(registerEmailDomain("weird@name@outlook.com"), "outlook.com");
});

test("registerEmailDomain: returns '' for missing/malformed addresses", () => {
  assert.equal(registerEmailDomain(""), "");
  assert.equal(registerEmailDomain("no-at-sign"), "");
  assert.equal(registerEmailDomain("trailing@"), "");
  assert.equal(registerEmailDomain(undefined), "");
  assert.equal(registerEmailDomain(null), "");
});

test("isRegisterAllowedEmailDomain: every domain in the allow-list itself is accepted", () => {
  for (const domain of REGISTER_ALLOWED_EMAIL_DOMAINS) {
    assert.equal(isRegisterAllowedEmailDomain(`user@${domain}`), true, `expected ${domain} to be allowed`);
  }
});

test("isRegisterAllowedEmailDomain: is case-insensitive on the domain", () => {
  assert.equal(isRegisterAllowedEmailDomain("user@GMAIL.COM"), true);
  assert.equal(isRegisterAllowedEmailDomain("user@Outlook.Com"), true);
});

test("isRegisterAllowedEmailDomain: rejects a domain not on the list", () => {
  assert.equal(isRegisterAllowedEmailDomain("user@some-random-unknown-provider.zzz"), false);
  assert.equal(isRegisterAllowedEmailDomain("user@gmail.com.evil.com"), false, "suffix trickery must not match");
});

test("isRegisterAllowedEmailDomain: rejects malformed input without throwing", () => {
  assert.equal(isRegisterAllowedEmailDomain(""), false);
  assert.equal(isRegisterAllowedEmailDomain("not-an-email"), false);
});
