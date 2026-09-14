import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Verifies registerPost's provisioning transaction actually creates every side effect it
// documents (welcome-miner inventory, starter room/rack, userIpLog) atomically alongside the
// user row, and the referral / self-referral / duplicate-account business rules.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { registerPost } = await import("../../server/modules/auth/register/register.controller.ts");
const { hashPassword } = await import("../../server/modules/auth/auth.service.ts");
const { listEnabledProxyProviders } = await import("../../server/modules/ip-intelligence/index.ts");

async function seedResidentialIpIntel(ip) {
  const now = new Date();
  const freshUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const proxySource = listEnabledProxyProviders().map((p) => p.id).join(",") || "test";
  await prisma.ipIntelligenceCache.upsert({
    where: { ip },
    create: {
      ip,
      ipVersion: 4,
      providerType: "isp",
      confidence: "high",
      source: "test",
      checkedAt: now,
      expiresAt: freshUntil,
      proxyDetected: false,
      proxyCheckedAt: now,
      proxyExpiresAt: freshUntil,
      proxySource,
    },
    update: {
      providerType: "isp",
      proxyDetected: false,
      checkedAt: now,
      expiresAt: freshUntil,
      proxyCheckedAt: now,
      proxyExpiresAt: freshUntil,
      proxySource,
    },
  });
}

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

function deviceFingerprintHeader(seed) {
  const payload = { s: { width: 1920, height: 1080, dpr: 2 }, tz: "America/Sao_Paulo", l: "pt-BR", p: `seed-${seed}` };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function fakeReq(body, ip, antiBotPayload) {
  return {
    body,
    ip,
    headers: {
      "user-agent": "vitest-register-transaction",
      ...(antiBotPayload ? { "x-anti-bot-payload": antiBotPayload } : {}),
    },
  };
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
async function register(overrides = {}, ip = randomIp()) {
  const suffix = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const body = {
    username: `regtx_${suffix}`,
    email: `regtx_${suffix}@gmail.com`,
    password: "supersecret1",
    acceptTerms: true,
    ...overrides,
  };
  const res = fakeRes();
  await registerPost(fakeReq(body, ip, deviceFingerprintHeader(suffix)), res);
  if (res.calls.json?.user?.id) createdUserIds.push(res.calls.json.user.id);
  return { res, body, ip };
}

test.after(async () => {
  if (createdUserIds.length) {
    const where = { userId: { in: createdUserIds } };
    await prisma.refreshToken.deleteMany({ where }).catch(() => {});
    await prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: createdUserIds } }, { referredId: { in: createdUserIds } }] } }).catch(() => {});
    await prisma.userInventory.deleteMany({ where }).catch(() => {});
    await prisma.userOwnedMachine.deleteMany({ where }).catch(() => {});
    await prisma.userRack.deleteMany({ where }).catch(() => {});
    await prisma.userRoom.deleteMany({ where }).catch(() => {});
    await prisma.userIpLog.deleteMany({ where }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("registerPost: creates the user row with the expected defaults", async () => {
  const { res } = await register();
  assert.equal(res.calls.status, 201, JSON.stringify(res.calls.json));
  const userId = res.calls.json.user.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(Number(user.polBalance), 0);
  assert.equal(Number(user.usdcBalance), 0);
  assert.ok(user.refCode && user.refCode.length > 0);
});

test("registerPost: hashes the password at bcrypt cost 12 (2026-09-11 hardening, was 10)", async () => {
  const { res } = await register();
  const userId = res.calls.json.user.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // bcrypt hash shape: $<version>$<cost>$<salt+hash>, e.g. "$2a$12$...".
  const cost = Number(user.passwordHash.split("$")[2]);
  assert.equal(cost, 12);
});

test("registerPost: grants the welcome-miner inventory in the same transaction", async () => {
  const { res } = await register();
  const userId = res.calls.json.user.id;
  const count = await prisma.userInventory.count({ where: { userId } });
  assert.ok(count > 0, "expected at least one welcome-miner inventory row");
});

test("registerPost: provisions a starter room in the same transaction", async () => {
  const { res } = await register();
  const userId = res.calls.json.user.id;
  const room = await prisma.userRoom.findFirst({ where: { userId } });
  assert.ok(room, "expected a starter UserRoom row");
});

test("registerPost: records a userIpLog row for the registration event", async () => {
  const ip = randomIp();
  const { res } = await register({}, ip);
  const userId = res.calls.json.user.id;
  const log = await prisma.userIpLog.findFirst({ where: { userId } });
  assert.ok(log, "expected a userIpLog row for this registration");
  assert.equal(log.ip, ip);
  assert.equal(log.registerCount, 1, "eventType:'register' must increment registerCount, not loginCount");
  assert.equal(log.loginCount, 0);
});

test("registerPost: a valid refCode creates a Referral row linking referrer -> new user", async () => {
  const { res: referrerRes } = await register();
  const referrerId = referrerRes.calls.json.user.id;
  const referrer = await prisma.user.findUniqueOrThrow({ where: { id: referrerId } });

  const { res: referredRes } = await register({ refCode: referrer.refCode });
  assert.equal(referredRes.calls.status, 201, JSON.stringify(referredRes.calls.json));
  const referredId = referredRes.calls.json.user.id;

  const referral = await prisma.referral.findFirst({ where: { referrerId, referredId } });
  assert.ok(referral, "expected a Referral row linking the two accounts");
});

test("registerPost: an invalid/unknown refCode is silently ignored (still 201, no Referral row, no crash)", async () => {
  const { res } = await register({ refCode: "totally-made-up-code-xyz" });
  assert.equal(res.calls.status, 201, JSON.stringify(res.calls.json));
  const referredId = res.calls.json.user.id;
  const referral = await prisma.referral.findFirst({ where: { referredId } });
  assert.equal(referral, null);
});

test("registerPost: self-referral (same IP as the referrer's registration IP) is blocked — no Referral row created", async () => {
  const sharedIp = randomIp();
  await seedResidentialIpIntel(sharedIp);
  const { res: firstRes } = await register({}, sharedIp);
  const firstUserId = firstRes.calls.json.user.id;
  const firstUser = await prisma.user.findUniqueOrThrow({ where: { id: firstUserId } });

  // Second registration from the SAME ip, using the first account's own refCode — a self-
  // referral attempt (or two accounts controlled by the same actor from one IP).
  const { res: secondRes } = await register({ refCode: firstUser.refCode }, sharedIp);
  assert.equal(secondRes.calls.status, 201, JSON.stringify(secondRes.calls.json));
  const secondUserId = secondRes.calls.json.user.id;

  const referral = await prisma.referral.findFirst({ where: { referrerId: firstUserId, referredId: secondUserId } });
  assert.equal(referral, null, "same-IP self-referral must not create a Referral row");
});

test("registerPost: duplicate email (case-insensitive) responds 409 USER_ALREADY_EXISTS, no second user created", async () => {
  const { res: firstRes, body } = await register();
  assert.equal(firstRes.calls.status, 201);

  const dupRes = fakeRes();
  await registerPost(
    fakeReq(
      { username: `otherusername_${Date.now()}`, email: body.email.toUpperCase(), password: "supersecret1", acceptTerms: true },
      randomIp(),
    ),
    dupRes,
  );
  assert.equal(dupRes.calls.status, 409);
  assert.equal(dupRes.calls.json.code, "USER_ALREADY_EXISTS");

  const count = await prisma.user.count({ where: { email: body.email } });
  assert.equal(count, 1, "must not have created a second user row");
});

test("registerPost: an existing display name does not block a free username", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
  const displayName = `sharedname_${suffix}`;
  const seed = await prisma.user.create({
    data: {
      name: displayName,
      username: `otheruser_${suffix}`,
      email: `otheruser_${suffix}@gmail.com`,
      passwordHash: await hashPassword("supersecret1"),
      registrationIp: "203.0.113.80",
      ip: "203.0.113.80",
    },
  });
  createdUserIds.push(seed.id);

  const { res } = await register({ username: displayName, email: `newuser_${suffix}@gmail.com` });
  assert.equal(res.calls.status, 201, JSON.stringify(res.calls.json));
});

test("registerPost: duplicate username (case-insensitive) responds 409 USER_ALREADY_EXISTS", async () => {
  const { res: firstRes, body } = await register();
  assert.equal(firstRes.calls.status, 201);

  const dupRes = fakeRes();
  const suffix = Date.now().toString(36);
  await registerPost(
    fakeReq(
      { username: body.username.toUpperCase(), email: `different_${suffix}@gmail.com`, password: "supersecret1", acceptTerms: true },
      randomIp(),
    ),
    dupRes,
  );
  assert.equal(dupRes.calls.status, 409);
  assert.equal(dupRes.calls.json.code, "USER_ALREADY_EXISTS");
});
