import test from "node:test";
import assert from "node:assert/strict";

// Covers auth.controller.ts's password-reset/change and resend-verification handlers —
// verifyEmailPost itself is already covered by emailVerification.integration.test.mjs.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const controller = await import("../../server/modules/auth/auth.controller.ts");
const { hashPassword, signPasswordResetToken } = await import("../../server/modules/auth/auth.service.ts");

function fakeRes() {
  const calls = { status: null, json: null, cookie: null, headers: {} };
  return {
    calls,
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
    cookie(name, value) {
      calls.cookie = { name, value };
      return this;
    },
    setHeader(name, value) {
      calls.headers[name] = value;
      return this;
    },
  };
}

function fakeReq(body, user) {
  return { body, user, ip: "203.0.113.200" };
}

const createdUserIds = [];
async function makeUser(overrides = {}) {
  const suffix = `authctl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Auth Controller Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: await hashPassword("currentpass1", 10),
      registrationIp: "203.0.113.201",
      ip: "203.0.113.201",
      userAgent: "test-agent/1.0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("changePasswordPost: 401 without a session user", async () => {
  const res = fakeRes();
  await controller.changePasswordPost(fakeReq({}), res);
  assert.equal(res.calls.status, 401);
});

test("changePasswordPost: wrong current password responds 401, password unchanged", async () => {
  const user = await makeUser();
  const res = fakeRes();
  await controller.changePasswordPost(fakeReq({ currentPassword: "wrong", newPassword: "newpassword1" }, user), res);
  assert.equal(res.calls.status, 401);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(fresh.passwordHash, user.passwordHash);
});

async function seedRefreshToken(userId) {
  return prisma.refreshToken.create({
    data: {
      userId,
      tokenId: `pwreset_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      tokenHash: "test-hash",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

function assertCost12Hash(passwordHash) {
  assert.match(passwordHash, /^\$2[abxy]\$12\$/, "password writes must keep OWASP bcrypt cost 12");
}

async function assertSessionsKilled(userId, beforeVersion, tokenId) {
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(fresh.sessionVersion, beforeVersion + 1);
  assertCost12Hash(fresh.passwordHash);
  const token = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenId } });
  assert.ok(token.revokedAt, "active refresh tokens must be revoked on password write");
  return fresh;
}

test("changePasswordPost: correct current password updates the hash, uses cost 12, and kills sessions", async () => {
  const user = await makeUser();
  const token = await seedRefreshToken(user.id);
  const res = fakeRes();
  await controller.changePasswordPost(fakeReq({ currentPassword: "currentpass1", newPassword: "brandnewpass1" }, user), res);
  assert.equal(res.calls.json.ok, true);
  assert.equal(res.calls.cookie, null, "change-password must not re-issue cookies on this device");
  const fresh = await assertSessionsKilled(user.id, user.sessionVersion, token.tokenId);
  assert.notEqual(fresh.passwordHash, user.passwordHash);
});

test("forgotPasswordPost: missing email responds 400", async () => {
  const res = fakeRes();
  await controller.forgotPasswordPost(fakeReq({}), res);
  assert.equal(res.calls.status, 400);
});

test("forgotPasswordPost: unknown email still responds ok:true (never reveals account existence)", async () => {
  const res = fakeRes();
  await controller.forgotPasswordPost(fakeReq({ email: "definitely-not-registered-abc@gmail.com" }), res);
  assert.equal(res.calls.json.ok, true);
  assert.equal(res.calls.status, null, "must be the default 200, not an error status");
});

test("forgotPasswordPost: a real email also responds the exact same generic ok:true message (no enumeration oracle)", async () => {
  const user = await makeUser();
  const unknownRes = fakeRes();
  await controller.forgotPasswordPost(fakeReq({ email: "definitely-not-registered-xyz@gmail.com" }), unknownRes);
  const knownRes = fakeRes();
  await controller.forgotPasswordPost(fakeReq({ email: user.email }), knownRes);
  assert.equal(unknownRes.calls.json.message, knownRes.calls.json.message);
  assert.equal(knownRes.calls.status, null);
});

test("resendVerificationPost: 401 without a session user", async () => {
  const res = fakeRes();
  await controller.resendVerificationPost(fakeReq({}), res);
  assert.equal(res.calls.status, 401);
});

test("resendVerificationPost: already-verified user responds ok:true without attempting to send", async () => {
  const user = await makeUser({ emailVerifiedAt: new Date() });
  const res = fakeRes();
  await controller.resendVerificationPost(fakeReq({}, user), res);
  assert.equal(res.calls.json.ok, true);
  assert.match(res.calls.json.message, /já está confirmado/);
});

test("resendVerificationPost: unverified user — real outcome depends on this sandbox's SMTP reachability (503 unconfigured, ok:true if a real send succeeds, or 500 if SMTP is configured but the send itself rejects)", async () => {
  const user = await makeUser({ emailVerifiedAt: null });
  const res = fakeRes();
  await controller.resendVerificationPost(fakeReq({}, user), res);
  // Real gap found while writing this test, not fixed here (same class as
  // login.controller.branches.test.mjs's 2FA-email finding): unlike forgotPasswordPost, which
  // deliberately swallows a mail-send failure to avoid an enumeration oracle,
  // resendVerificationPost's `await sendEmailVerificationEmail(...)` has no try/catch, so a
  // real-but-failing SMTP send here propagates into a generic 500 instead of a graceful
  // response. Pinning the actual behavior rather than asserting a nicer one this code doesn't
  // provide.
  assert.ok([null, 503, 500].includes(res.calls.status), `unexpected status ${res.calls.status}`);
  assert.equal(typeof res.calls.json.ok, "boolean");
});

test("resetPasswordManualPost / adminForcePasswordResetPost: 404 when the admin-keyed reset API is disabled (this environment's default)", async () => {
  await withEnv({ ADMIN_KEYED_PASSWORD_RESET_ENABLED: "" }, async () => {
    const res1 = fakeRes();
    await controller.resetPasswordManualPost(fakeReq({}), res1);
    assert.equal(res1.calls.status, 404);

    const res2 = fakeRes();
    await controller.adminForcePasswordResetPost(fakeReq({}), res2);
    assert.equal(res2.calls.status, 404);
  });
});

test("resetPasswordManualPost: enabled, wrong adminKey responds 403", async () => {
  await withEnv({ ADMIN_KEYED_PASSWORD_RESET_ENABLED: "1", ADMIN_SECURITY_CODE: "real-secret" }, async () => {
    const res = fakeRes();
    await controller.resetPasswordManualPost(fakeReq({ email: "x@y.com", newPassword: "newpassword1", adminKey: "wrong" }), res);
    assert.equal(res.calls.status, 403);
  });
});

test("resetPasswordManualPost: enabled, correct adminKey updates the password hash, uses cost 12, and kills sessions", async () => {
  await withEnv({ ADMIN_KEYED_PASSWORD_RESET_ENABLED: "1", ADMIN_SECURITY_CODE: "real-secret" }, async () => {
    const user = await makeUser();
    const token = await seedRefreshToken(user.id);
    const res = fakeRes();
    await controller.resetPasswordManualPost(
      fakeReq({ email: user.email, newPassword: "manualnewpass1", adminKey: "real-secret" }),
      res,
    );
    assert.equal(res.calls.json.ok, true, JSON.stringify(res.calls.json));
    const fresh = await assertSessionsKilled(user.id, user.sessionVersion, token.tokenId);
    assert.notEqual(fresh.passwordHash, user.passwordHash);
  });
});

test("resetPasswordManualPost: invalid new password length (<8) responds 400", async () => {
  await withEnv({ ADMIN_KEYED_PASSWORD_RESET_ENABLED: "1", ADMIN_SECURITY_CODE: "real-secret" }, async () => {
    const res = fakeRes();
    await controller.resetPasswordManualPost(fakeReq({ email: "x@y.com", newPassword: "short", adminKey: "real-secret" }), res);
    assert.equal(res.calls.status, 400);
  });
});

test("adminForcePasswordResetPost: enabled + correct key + unknown email responds 404", async () => {
  await withEnv({ ADMIN_KEYED_PASSWORD_RESET_ENABLED: "1", ADMIN_SECURITY_CODE: "real-secret" }, async () => {
    const res = fakeRes();
    await controller.adminForcePasswordResetPost(
      fakeReq({ email: "definitely-not-registered-force@gmail.com", newPassword: "newpassword1", adminKey: "real-secret" }),
      res,
    );
    assert.equal(res.calls.status, 404);
  });
});

test("legacyPasswordResetPost: missing/short newPassword responds 400", async () => {
  const res = fakeRes();
  await controller.legacyPasswordResetPost(fakeReq({ resetToken: "sometoken", newPassword: "short" }), res);
  assert.equal(res.calls.status, 400);
});

test("legacyPasswordResetPost: invalid resetToken responds 401", async () => {
  const res = fakeRes();
  await controller.legacyPasswordResetPost(fakeReq({ resetToken: "garbage-token", newPassword: "validpassword1" }), res);
  assert.equal(res.calls.status, 401);
});

test("legacyPasswordResetPost: a real signed reset token updates the password hash, uses cost 12, and kills sessions", async () => {
  const user = await makeUser();
  const token = await seedRefreshToken(user.id);
  const resetToken = signPasswordResetToken(user.id, user.passwordResetVersion);
  const res = fakeRes();
  await controller.legacyPasswordResetPost(fakeReq({ resetToken, newPassword: "legacynewpass1" }), res);
  assert.equal(res.calls.json.ok, true, JSON.stringify(res.calls.json));
  const fresh = await assertSessionsKilled(user.id, user.sessionVersion, token.tokenId);
  assert.notEqual(fresh.passwordHash, user.passwordHash);
});

const SMTP_FOR_FORGOT = {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1",
  SMTP_USER: "test",
  SMTP_PASS: "test",
  SMTP_FROM: "noreply@blockminer.test",
  SMTP_SECURE: "false",
};

test("forgotPasswordPost: increments passwordResetVersion when SMTP is configured", async () => {
  await withEnv(SMTP_FOR_FORGOT, async () => {
    const user = await makeUser();
    assert.equal(user.passwordResetVersion, 0);
    const res = fakeRes();
    await controller.forgotPasswordPost(fakeReq({ email: user.email }), res);
    assert.equal(res.calls.json.ok, true);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(fresh.passwordResetVersion, 1);
  });
});

test("legacyPasswordResetPost: current prv token succeeds; reusing it after consume is 401", async () => {
  await withEnv(SMTP_FOR_FORGOT, async () => {
    const user = await makeUser();
    await controller.forgotPasswordPost(fakeReq({ email: user.email }), fakeRes());
    const afterForgot = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const resetToken = signPasswordResetToken(user.id, afterForgot.passwordResetVersion);
    const first = fakeRes();
    await controller.legacyPasswordResetPost(fakeReq({ resetToken, newPassword: "afterforgotpass1" }), first);
    assert.equal(first.calls.json.ok, true, JSON.stringify(first.calls.json));
    const replay = fakeRes();
    await controller.legacyPasswordResetPost(fakeReq({ resetToken, newPassword: "afterforgotpass2" }), replay);
    assert.equal(replay.calls.status, 401);
    assert.equal(replay.calls.json.ok, false);
  });
});

test("legacyPasswordResetPost: a second forgot invalidates the first reset token", async () => {
  await withEnv(SMTP_FOR_FORGOT, async () => {
    const user = await makeUser();
    await controller.forgotPasswordPost(fakeReq({ email: user.email }), fakeRes());
    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const firstToken = signPasswordResetToken(user.id, afterFirst.passwordResetVersion);
    await controller.forgotPasswordPost(fakeReq({ email: user.email }), fakeRes());
    const stale = fakeRes();
    await controller.legacyPasswordResetPost(fakeReq({ resetToken: firstToken, newPassword: "staletokenpass1" }), stale);
    assert.equal(stale.calls.status, 401);
    const afterSecond = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const currentToken = signPasswordResetToken(user.id, afterSecond.passwordResetVersion);
    const okRes = fakeRes();
    await controller.legacyPasswordResetPost(fakeReq({ resetToken: currentToken, newPassword: "freshresetpass1" }), okRes);
    assert.equal(okRes.calls.json.ok, true, JSON.stringify(okRes.calls.json));
  });
});

test("adminForcePasswordResetPost: enabled + correct key updates the hash, uses cost 12, and kills sessions", async () => {
  await withEnv({ ADMIN_KEYED_PASSWORD_RESET_ENABLED: "1", ADMIN_SECURITY_CODE: "real-secret" }, async () => {
    const user = await makeUser();
    const token = await seedRefreshToken(user.id);
    const res = fakeRes();
    await controller.adminForcePasswordResetPost(
      fakeReq({ email: user.email, newPassword: "forcenewpass1", adminKey: "real-secret" }),
      res,
    );
    assert.equal(res.calls.json.ok, true, JSON.stringify(res.calls.json));
    const fresh = await assertSessionsKilled(user.id, user.sessionVersion, token.tokenId);
    assert.notEqual(fresh.passwordHash, user.passwordHash);
  });
});
