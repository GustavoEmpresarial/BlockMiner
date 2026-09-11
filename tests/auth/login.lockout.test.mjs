import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Exercises login.lockout.ts (ported from legacy accountLockoutService.ts) both directly
// (unit-level, against the real dev Postgres callback_queue table) and through the real
// loginPost controller (integration-level), mirroring tests/auth/register.provisioning.test.mjs's
// pattern of driving controllers with fake Request/Response objects against the real DB.

const { getAuthLockStatus, recordAuthLoginFailure, recordAuthLoginSuccess } = await import(
  "../../server/modules/auth/login/login.lockout.ts"
);
const { loginPost } = await import("../../server/modules/auth/login/login.controller.ts");
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

function fakeReq(body, ip) {
  return {
    body,
    ip,
    headers: { "user-agent": "vitest-lockout" },
  };
}

function randomIp() {
  // Unique per-test IPv4 with enough entropy to avoid collisions across this file's own tests
  // AND other test files/suites sharing the same Postgres-backed IP-lockout counters in a full
  // `npm test` run. A single /24 (253 values, e.g. 203.0.113.x) was previously used here and
  // collided often enough under full-suite load to cause real, reproducible test flakiness
  // (confirmed: ~1-in-3 runs failed from IP reuse, not infra contention).
  // First octet is deliberately kept OUTSIDE ip-intelligence's isPrivateOrLinkLocal ranges
  // (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 — see ip-address.ts) so this still exercises
  // the same "real-looking public IP" code path the lockout logic runs in production, instead of
  // silently getting isInfrastructureIp-classified and short-circuited differently.
  const RESERVED_FIRST_OCTETS = new Set([10, 127, 169, 172, 192]);
  let firstOctet;
  do {
    firstOctet = crypto.randomInt(1, 224); // 1-223, i.e. never touches the 224-255 multicast/reserved block
  } while (RESERVED_FIRST_OCTETS.has(firstOctet));
  return `${firstOctet}.${crypto.randomInt(0, 256)}.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;
}

test("login.lockout: getAuthLockStatus/recordAuthLoginFailure — locks after 5 failures within the window", async () => {
  const ip = randomIp();

  assert.equal((await getAuthLockStatus({ ip, userId: null })).locked, false);

  for (let i = 0; i < 4; i += 1) {
    await recordAuthLoginFailure({ ip, userId: null });
  }
  assert.equal((await getAuthLockStatus({ ip, userId: null })).locked, false, "still unlocked after 4 failures");

  await recordAuthLoginFailure({ ip, userId: null }); // 5th failure crosses TIER_FIRST
  const status = await getAuthLockStatus({ ip, userId: null });
  assert.equal(status.locked, true);
  assert.ok(status.until > Date.now());
});

test("login.lockout: recordAuthLoginSuccess clears the counter", async () => {
  const ip = randomIp();
  for (let i = 0; i < 5; i += 1) {
    await recordAuthLoginFailure({ ip, userId: null });
  }
  assert.equal((await getAuthLockStatus({ ip, userId: null })).locked, true);

  await recordAuthLoginSuccess({ ip, userId: null });
  assert.equal((await getAuthLockStatus({ ip, userId: null })).locked, false);
});

test("login.lockout: lock releases once the window (lockUntilMs) has expired", async () => {
  const ip = randomIp();
  for (let i = 0; i < 5; i += 1) {
    await recordAuthLoginFailure({ ip, userId: null });
  }
  assert.equal((await getAuthLockStatus({ ip, userId: null })).locked, true);

  // Simulate the lockout window elapsing (equivalent to waiting the real 15
  // minutes) by rewriting the stored lockUntilMs into the past.
  const hash = crypto.createHash("sha256").update(`ip:${ip}`).digest("hex");
  const row = await prisma.callbackQueue.findFirst({ where: { callbackType: "SEC_LOCK", callbackHash: hash } });
  assert.ok(row, "expected a SEC_LOCK row to exist for this ip");
  await prisma.callbackQueue.update({
    where: { id: row.id },
    data: { data: { ...row.data, lockUntilMs: Date.now() - 1000 } },
  });

  assert.equal((await getAuthLockStatus({ ip, userId: null })).locked, false, "lock must release once expired");
});

test("login.lockout: loginPost locks out after 5 wrong-password attempts from the same IP, then blocks even a correct password", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const email = `lockouttest_${suffix}@gmail.com`;
  const password = "correct-horse-battery-1";
  const ip = randomIp();

  const regReq = fakeReq(
    { username: `lockouttest_${suffix}`, email, password, acceptTerms: true },
    ip,
  );
  const regRes = fakeRes();
  await registerPost(regReq, regRes);
  assert.equal(regRes.calls.status, 201, `setup register failed: ${JSON.stringify(regRes.calls.json)}`);

  for (let i = 0; i < 5; i += 1) {
    const res = fakeRes();
    await loginPost(fakeReq({ identifier: email, password: "wrong-password" }, ip), res);
    assert.equal(res.calls.status, 401, `attempt ${i + 1} should be 401 INVALID_CREDENTIALS`);
  }

  const lockedRes = fakeRes();
  await loginPost(fakeReq({ identifier: email, password }, ip), lockedRes);
  assert.equal(lockedRes.calls.status, 403, `expected lockout 403, got ${JSON.stringify(lockedRes.calls.json)}`);
  assert.equal(lockedRes.calls.json.code, "ACCOUNT_LOCKED");
});
