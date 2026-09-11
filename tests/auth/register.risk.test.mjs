import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Exercises register.risk.ts (ported from legacy authNetworkSignalService.ts's
// evaluateRegistrationAttempt) both directly against the real dev Postgres userIpLog
// table, and through the real registerPost controller — same pattern as
// tests/auth/register.provisioning.test.mjs.

const { evaluateRegistrationAttempt } = await import("../../server/modules/auth/register/register.risk.ts");
const { registerPost } = await import("../../server/modules/auth/register/register.controller.ts");
const prisma = (await import("../../server/core/database/prisma.ts")).default;

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

function fakeReq(body, ip, xAntiBotPayload) {
  return {
    body,
    ip,
    headers: {
      "user-agent": "vitest-register-risk",
      ...(xAntiBotPayload ? { "x-anti-bot-payload": xAntiBotPayload } : {}),
    },
  };
}

function randomIp() {
  // See tests/auth/login.lockout.test.mjs's randomIp() for the full rationale: needs way more
  // entropy than a single /24 (same shared Postgres-backed IP-keyed state — registration-risk
  // cooldown here — same collision-flakiness root cause), AND must avoid ip-intelligence's
  // isPrivateOrLinkLocal ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16) so it still
  // exercises the real "public IP" code path instead of the isInfrastructureIp short-circuit.
  const RESERVED_FIRST_OCTETS = new Set([10, 127, 169, 172, 192]);
  let firstOctet;
  do {
    firstOctet = crypto.randomInt(1, 224);
  } while (RESERVED_FIRST_OCTETS.has(firstOctet));
  return `${firstOctet}.${crypto.randomInt(0, 256)}.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;
}

test("register.risk: evaluateRegistrationAttempt allows a fresh device/ip with no history", async () => {
  const result = await evaluateRegistrationAttempt(prisma, {
    ip: randomIp(),
    networkCidr: null,
    providerType: "unknown",
    deviceFingerprint: crypto.randomBytes(16).toString("hex"),
  });
  assert.equal(result.allowed, true);
  assert.equal(result.score, 0);
});

test("register.risk: evaluateRegistrationAttempt blocks when the same device fingerprint registered twice recently", async () => {
  const fingerprint = crypto.randomBytes(16).toString("hex");
  const ip = randomIp();
  const now = new Date();

  // Seed two prior registration rows for this exact device fingerprint, as
  // recordUserIpLog(eventType: "register") would have written them — each from
  // a distinct user/ip pair (the unique key is userId+ip+deviceFingerprint), but
  // sharing the fingerprint so the fingerprint-reuse heuristic fires.
  const seedUsers = await prisma.user.findMany({ select: { id: true }, take: 2 });
  assert.ok(seedUsers.length >= 2, "expected at least 2 existing users in dev DB to seed userIpLog rows");
  for (let i = 0; i < 2; i += 1) {
    await prisma.userIpLog.create({
      data: {
        userId: seedUsers[i].id,
        ip: `${ip}.${i}`,
        deviceFingerprint: fingerprint,
        registerCount: 1,
        lastSeen: now,
      },
    });
  }

  const result = await evaluateRegistrationAttempt(prisma, {
    ip: randomIp(), // different IP — only the fingerprint should trigger this
    networkCidr: null,
    providerType: "unknown",
    deviceFingerprint: fingerprint,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.score >= 70);
  assert.equal(result.cooldownMinutes, 15);
  assert.equal(result.recentFingerprint, 2);
});

test("register.risk: registerPost blocks the 3rd registration in a row sharing the same device fingerprint + IP", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const ip = randomIp();
  const antiBotPayload = deviceFingerprintHeader(suffix);

  const attempt = async (n) => {
    const email = `regrisk_${suffix}_${n}@gmail.com`;
    const res = fakeRes();
    await registerPost(
      fakeReq({ username: `regrisk_${suffix}_${n}`, email, password: "supersecret1", acceptTerms: true }, ip, antiBotPayload),
      res,
    );
    return res;
  };

  const res1 = await attempt(1);
  assert.equal(res1.calls.status, 201, `1st register should succeed: ${JSON.stringify(res1.calls.json)}`);

  const res2 = await attempt(2);
  assert.equal(res2.calls.status, 201, `2nd register should succeed: ${JSON.stringify(res2.calls.json)}`);

  const res3 = await attempt(3);
  assert.equal(res3.calls.status, 429, `3rd register from same device+ip should be cooled down: ${JSON.stringify(res3.calls.json)}`);
  assert.equal(res3.calls.json.code, "REGISTRATION_COOLDOWN");
});
