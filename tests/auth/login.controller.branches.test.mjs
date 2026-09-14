import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Covers loginPost branches not exercised by login.lockout.test.mjs or
// session-issuance.characterization.test.mjs: username-without-@ guard, unknown identifier,
// banned account, and the full email-2FA flow (challenge required / wrong code / success).
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { loginPost } = await import("../../server/modules/auth/login/login.controller.ts");
const { registerPost } = await import("../../server/modules/auth/register/register.controller.ts");
const { issueEmailTwoFactorChallenge } = await import("../../server/modules/auth/login/login.twoFactorChallenge.ts");
const { hashPassword } = await import("../../server/shared/security/password.ts");

function fakeRes() {
  const calls = { status: null, json: null, headers: {} };
  return {
    calls,
    locals: {},
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
    setHeader(name, value) {
      calls.headers[name] = value;
      return this;
    },
  };
}

function fakeReq(body, ip) {
  return { body, ip, headers: { "user-agent": "vitest-login-branches" } };
}

function randomIp() {
  const RESERVED_FIRST_OCTETS = new Set([10, 127, 169, 172, 192]);
  let firstOctet;
  do {
    firstOctet = crypto.randomInt(1, 224);
  } while (RESERVED_FIRST_OCTETS.has(firstOctet));
  return `${firstOctet}.${crypto.randomInt(0, 256)}.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;
}

const createdUserIds = [];
async function makeUser(overrides = {}) {
  const suffix = `loginbr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Login Branches Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: await hashPassword("supersecret1", 10),
      registrationIp: "203.0.113.99",
      ip: "203.0.113.99",
      userAgent: "test-agent/1.0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) {
    const where = { userId: { in: createdUserIds } };
    // registerPost's provisioning transaction creates several dependent rows (welcome-miner
    // inventory, starter room/racks, ip log) beyond just the user row itself.
    await prisma.refreshToken.deleteMany({ where }).catch(() => {});
    await prisma.userInventory.deleteMany({ where }).catch(() => {});
    await prisma.userOwnedMachine.deleteMany({ where }).catch(() => {});
    await prisma.userRack.deleteMany({ where }).catch(() => {});
    await prisma.userRoom.deleteMany({ where }).catch(() => {});
    await prisma.userIpLog.deleteMany({ where }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("loginPost: identifier without '@' responds 400 USERNAME_NOT_SUPPORTED", async () => {
  const res = fakeRes();
  await loginPost(fakeReq({ identifier: "not-an-email", password: "whatever" }, randomIp()), res);
  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.code, "USERNAME_NOT_SUPPORTED");
});

test("loginPost: unknown email responds 401 INVALID_CREDENTIALS (goes through the dummy-password timing path)", async () => {
  const res = fakeRes();
  await loginPost(fakeReq({ identifier: "definitely-not-registered-xyz@gmail.com", password: "whatever" }, randomIp()), res);
  assert.equal(res.calls.status, 401);
  assert.equal(res.calls.json.code, "INVALID_CREDENTIALS");
});

test("loginPost: a banned account responds 403 ACCOUNT_DISABLED with the ban details", async () => {
  const ip = randomIp();
  const regRes = fakeRes();
  await registerPost(
    fakeReq({ username: `banned_${Date.now()}`, email: `banned_${Date.now()}@gmail.com`, password: "supersecret1", acceptTerms: true }, ip),
    regRes,
  );
  assert.equal(regRes.calls.status, 201, JSON.stringify(regRes.calls.json));
  const userId = regRes.calls.json.user.id;
  createdUserIds.push(userId);
  await prisma.user.update({ where: { id: userId }, data: { isBanned: true, banReason: "teste automatizado", bannedUntil: null } });

  const res = fakeRes();
  await loginPost(fakeReq({ identifier: regRes.calls.json.user.email, password: "supersecret1" }, ip), res);
  assert.equal(res.calls.status, 403);
  assert.equal(res.calls.json.code, "ACCOUNT_DISABLED");
  assert.equal(res.calls.json.permanent, true);
});

test("loginPost: email 2FA required (env-forced) with no token/challenge issues a challenge instead of a session (or 503 if SMTP is unreachable here)", async () => {
  const prevEnabled = process.env.AUTH_EMAIL_2FA_ENABLED;
  const prevAll = process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
  process.env.AUTH_EMAIL_2FA_ENABLED = "1";
  process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = "1";
  try {
    const user = await makeUser();
    const res = fakeRes();
    await loginPost(fakeReq({ identifier: user.email, password: "supersecret1" }, randomIp()), res);
    if (res.calls.status === 503) {
      assert.equal(res.calls.json.code, "EMAIL_2FA_UNAVAILABLE");
    } else if (res.calls.status === 200) {
      assert.equal(res.calls.json.ok, false);
      assert.equal(res.calls.json.code, "TWO_FACTOR_REQUIRED");
      assert.equal(typeof res.calls.json.twoFactorChallengeToken, "string");
    } else {
      assert.fail(`expected 200 TWO_FACTOR_REQUIRED or 503 EMAIL_2FA_UNAVAILABLE, got ${res.calls.status} ${JSON.stringify(res.calls.json)}`);
    }
  } finally {
    if (prevEnabled === undefined) delete process.env.AUTH_EMAIL_2FA_ENABLED;
    else process.env.AUTH_EMAIL_2FA_ENABLED = prevEnabled;
    if (prevAll === undefined) delete process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
    else process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = prevAll;
  }
});

test("loginPost: sending only twoFactorToken without a challenge responds 400 TWO_FACTOR_CHALLENGE_REQUIRED", async () => {
  const prevEnabled = process.env.AUTH_EMAIL_2FA_ENABLED;
  const prevAll = process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
  process.env.AUTH_EMAIL_2FA_ENABLED = "1";
  process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = "1";
  try {
    const user = await makeUser();
    const res = fakeRes();
    await loginPost(fakeReq({ identifier: user.email, password: "supersecret1", twoFactorToken: "123456" }, randomIp()), res);
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, "TWO_FACTOR_CHALLENGE_REQUIRED");
  } finally {
    if (prevEnabled === undefined) delete process.env.AUTH_EMAIL_2FA_ENABLED;
    else process.env.AUTH_EMAIL_2FA_ENABLED = prevEnabled;
    if (prevAll === undefined) delete process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
    else process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = prevAll;
  }
});

test("loginPost: sending only twoFactorChallengeToken without a code responds 400 TWO_FACTOR_CODE_REQUIRED", async () => {
  const prevEnabled = process.env.AUTH_EMAIL_2FA_ENABLED;
  const prevAll = process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
  process.env.AUTH_EMAIL_2FA_ENABLED = "1";
  process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = "1";
  try {
    const user = await makeUser();
    const res = fakeRes();
    await loginPost(fakeReq({ identifier: user.email, password: "supersecret1", twoFactorChallengeToken: "sometoken" }, randomIp()), res);
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, "TWO_FACTOR_CODE_REQUIRED");
  } finally {
    if (prevEnabled === undefined) delete process.env.AUTH_EMAIL_2FA_ENABLED;
    else process.env.AUTH_EMAIL_2FA_ENABLED = prevEnabled;
    if (prevAll === undefined) delete process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
    else process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = prevAll;
  }
});

test("loginPost: wrong 2FA code responds 401 INVALID_TWO_FACTOR_CODE; the real code completes the login", async () => {
  const prevEnabled = process.env.AUTH_EMAIL_2FA_ENABLED;
  const prevAll = process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
  process.env.AUTH_EMAIL_2FA_ENABLED = "1";
  process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = "1";
  try {
    const user = await makeUser();
    // Mint a real challenge directly (bypassing the mail-send step, same as
    // login.twoFactorChallenge.test.mjs) so this test doesn't depend on SMTP.
    const origRandomBytes = crypto.randomBytes;
    const origRandomInt = crypto.randomInt;
    crypto.randomBytes = (n) => Buffer.alloc(n, 42);
    crypto.randomInt = () => 555555;
    let challengeToken;
    try {
      const issued = await issueEmailTwoFactorChallenge({ userId: user.id, email: user.email, name: user.name }).catch(() => null);
      challengeToken = issued?.challengeToken ?? Buffer.alloc(24, 42).toString("base64url");
    } finally {
      crypto.randomBytes = origRandomBytes;
      crypto.randomInt = origRandomInt;
    }

    const wrongRes = fakeRes();
    await loginPost(
      fakeReq({ identifier: user.email, password: "supersecret1", twoFactorToken: "000000", twoFactorChallengeToken: challengeToken }, randomIp()),
      wrongRes,
    );
    assert.equal(wrongRes.calls.status, 401);
    assert.equal(wrongRes.calls.json.code, "INVALID_TWO_FACTOR_CODE");

    const rightRes = fakeRes();
    await loginPost(
      fakeReq({ identifier: user.email, password: "supersecret1", twoFactorToken: "555555", twoFactorChallengeToken: challengeToken }, randomIp()),
      rightRes,
    );
    assert.equal(rightRes.calls.json.ok, true, JSON.stringify(rightRes.calls.json));
  } finally {
    if (prevEnabled === undefined) delete process.env.AUTH_EMAIL_2FA_ENABLED;
    else process.env.AUTH_EMAIL_2FA_ENABLED = prevEnabled;
    if (prevAll === undefined) delete process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS;
    else process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS = prevAll;
  }
});
