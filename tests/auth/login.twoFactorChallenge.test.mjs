import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Unit tests for login.twoFactorChallenge.ts's in-memory challenge issue/verify contract
// (zero prior coverage). This environment has real SMTP configured but outbound sending
// disabled for the account, so issueEmailTwoFactorChallenge's `await sendLoginTwoFactorCodeEmail`
// rejects here — a real, useful finding on its own (see the note below), but it also means we
// can't get the real random challengeToken/code back from a normal call. Since the module
// stores the challenge in its Map BEFORE awaiting the mail send, we make crypto.randomBytes/
// randomInt deterministic for one call so we can predict the exact token/code the module
// generates, call issueEmailTwoFactorChallenge (swallowing the expected mail-send rejection),
// and then exercise verifyEmailTwoFactorChallenge (pure, no I/O) against the real stored entry.

const { issueEmailTwoFactorChallenge, verifyEmailTwoFactorChallenge, EMAIL_TWO_FACTOR_MAX_FAILED_ATTEMPTS } = await import(
  "../../server/modules/auth/login/login.twoFactorChallenge.ts"
);

async function issueDeterministic(userId, { fixedTokenByte = 7, fixedCode = 123456 } = {}) {
  const origRandomBytes = crypto.randomBytes;
  const origRandomInt = crypto.randomInt;
  crypto.randomBytes = (n) => origRandomBytes.fill ? Buffer.alloc(n, fixedTokenByte) : Buffer.alloc(n, fixedTokenByte);
  crypto.randomInt = () => fixedCode;
  try {
    const expectedToken = Buffer.alloc(24, fixedTokenByte).toString("base64url");
    let issued;
    try {
      issued = await issueEmailTwoFactorChallenge({ userId, email: "user@example.com", name: "Test User" });
    } catch (err) {
      // Expected in this sandbox (SMTP configured, outbound disabled) — the challenge was
      // already stored in the module's Map before the mail-send rejection, per the source.
      issued = { challengeToken: expectedToken };
    }
    return { challengeToken: issued.challengeToken, code: String(fixedCode).padStart(6, "0") };
  } finally {
    crypto.randomBytes = origRandomBytes;
    crypto.randomInt = origRandomInt;
  }
}

test("issueEmailTwoFactorChallenge + verifyEmailTwoFactorChallenge: correct token+code+userId succeeds exactly once (single-use)", async () => {
  const userId = 1001;
  const { challengeToken, code } = await issueDeterministic(userId);

  const first = verifyEmailTwoFactorChallenge({ challengeToken, code, userId });
  assert.deepEqual(first, { ok: true });

  const second = verifyEmailTwoFactorChallenge({ challengeToken, code, userId });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "INVALID", "a consumed challenge must not be reusable");
});

test("verifyEmailTwoFactorChallenge: wrong code with a real token/userId is INVALID and does not consume the challenge", async () => {
  const userId = 1002;
  const { challengeToken, code } = await issueDeterministic(userId, { fixedTokenByte: 8, fixedCode: 222222 });

  const wrong = verifyEmailTwoFactorChallenge({ challengeToken, code: "000000", userId });
  assert.deepEqual(wrong, { ok: false, reason: "INVALID" });

  // Still consumable afterwards with the real code — a wrong guess must not burn the challenge.
  const right = verifyEmailTwoFactorChallenge({ challengeToken, code, userId });
  assert.deepEqual(right, { ok: true });
});

test("verifyEmailTwoFactorChallenge: mismatched userId (right token+code, wrong account) is INVALID", async () => {
  const userId = 1003;
  const { challengeToken, code } = await issueDeterministic(userId, { fixedTokenByte: 9, fixedCode: 333333 });
  const result = verifyEmailTwoFactorChallenge({ challengeToken, code, userId: userId + 1 });
  assert.deepEqual(result, { ok: false, reason: "INVALID" });
});

test("verifyEmailTwoFactorChallenge: an unknown/never-issued token is INVALID", () => {
  const result = verifyEmailTwoFactorChallenge({ challengeToken: "not-a-real-token", code: "123456", userId: 1 });
  assert.deepEqual(result, { ok: false, reason: "INVALID" });
});

test("verifyEmailTwoFactorChallenge: missing challengeToken is INVALID, never throws", () => {
  const result = verifyEmailTwoFactorChallenge({ code: "123456", userId: 1 });
  assert.deepEqual(result, { ok: false, reason: "INVALID" });
});

test("verifyEmailTwoFactorChallenge: EMAIL_TWO_FACTOR_MAX_FAILED_ATTEMPTS wrong codes consume the challenge", async () => {
  const userId = 1005;
  const { challengeToken, code } = await issueDeterministic(userId, { fixedTokenByte: 11, fixedCode: 555555 });

  for (let i = 0; i < EMAIL_TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1; i += 1) {
    const wrong = verifyEmailTwoFactorChallenge({ challengeToken, code: "000000", userId });
    assert.deepEqual(wrong, { ok: false, reason: "INVALID" });
  }

  const lastWrong = verifyEmailTwoFactorChallenge({ challengeToken, code: "000000", userId });
  assert.deepEqual(lastWrong, { ok: false, reason: "INVALID" });

  const afterLock = verifyEmailTwoFactorChallenge({ challengeToken, code, userId });
  assert.deepEqual(
    afterLock,
    { ok: false, reason: "INVALID" },
    "the real code must not work after the failed-attempt cap deletes the challenge",
  );
});

test("verifyEmailTwoFactorChallenge: an expired challenge reports EXPIRED and is consumed (retrying gives INVALID, not EXPIRED again)", async () => {
  const userId = 1004;
  const { challengeToken, code } = await issueDeterministic(userId, { fixedTokenByte: 10, fixedCode: 444444 });

  const origNow = Date.now;
  try {
    // 10-minute TTL (CHALLENGE_TTL_MS) — fast-forward 11 minutes without a real wait.
    Date.now = () => origNow() + 11 * 60_000;
    const expired = verifyEmailTwoFactorChallenge({ challengeToken, code, userId });
    assert.deepEqual(expired, { ok: false, reason: "EXPIRED" });

    const retry = verifyEmailTwoFactorChallenge({ challengeToken, code, userId });
    assert.deepEqual(retry, { ok: false, reason: "INVALID" }, "an expired-then-deleted challenge must not keep reporting EXPIRED");
  } finally {
    Date.now = origNow;
  }
});
