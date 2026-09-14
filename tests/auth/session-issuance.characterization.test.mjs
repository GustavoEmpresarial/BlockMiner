import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Characterizes how login/register issue a session (cookies, refresh token, lockout-counter
// interaction) BEFORE and AFTER consolidating both onto auth.sessionIssue.ts's
// issueAuthSessionForUser (already used, unmodified, by the Google/SatsPay OAuth controllers).
//
// Session issuance is shared via issueAuthSessionForUser. A successful login/register
// clears the *user* lockout counter only — the IP spray counter stays (see login.lockout.ts).

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { registerPost } = await import("../../server/modules/auth/register/register.controller.ts");
const { loginPost } = await import("../../server/modules/auth/login/login.controller.ts");
const { recordAuthLoginFailure } = await import("../../server/modules/auth/login/login.lockout.ts");

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
  return { body, ip, headers: { "user-agent": "vitest-session-issuance" } };
}

function deviceFingerprintHeader(seed) {
  const payload = { s: { width: 1920, height: 1080, dpr: 2 }, tz: "America/Sao_Paulo", l: "pt-BR", p: `seed-${seed}` };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function randomIp() {
  const RESERVED_FIRST_OCTETS = new Set([10, 127, 169, 172, 192]);
  let firstOctet;
  do {
    firstOctet = crypto.randomInt(1, 224);
  } while (RESERVED_FIRST_OCTETS.has(firstOctet));
  return `${firstOctet}.${crypto.randomInt(0, 256)}.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;
}

function ipFailCountHash(ip) {
  return crypto.createHash("sha256").update(`ip:${ip}`).digest("hex");
}

async function ipFailCount(ip) {
  const row = await prisma.callbackQueue.findFirst({ where: { callbackType: "SEC_LOCK", callbackHash: ipFailCountHash(ip) } });
  const data = row?.data && typeof row.data === "object" ? row.data : {};
  return Number(data.failCount ?? 0);
}

function newRegBody(suffix) {
  return { username: `sessiss_${suffix}`, email: `sessiss_${suffix}@gmail.com`, password: "supersecret1", acceptTerms: true };
}

test("registerPost sets all 3 session cookies (access/refresh/csrf) and creates a refreshToken row", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const ip = randomIp();
  const res = fakeRes();
  await registerPost(fakeReq(newRegBody(suffix), ip), res);
  assert.equal(res.calls.status, 201, JSON.stringify(res.calls.json));

  const setCookie = res.calls.headers["Set-Cookie"];
  assert.equal(setCookie.length, 3, "must set exactly access + refresh + csrf cookies");

  const userId = res.calls.json.user.id;
  const tokenCount = await prisma.refreshToken.count({ where: { userId } });
  assert.equal(tokenCount, 1, "a fresh registration must create exactly one refresh token");
});

test("loginPost sets all 3 session cookies and rotates the refresh token on each login", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const email = `sessiss_${suffix}@gmail.com`;
  const password = "supersecret1";
  const ip = randomIp();

  const regRes = fakeRes();
  await registerPost(fakeReq(newRegBody(suffix), ip), regRes);
  assert.equal(regRes.calls.status, 201);
  const userId = regRes.calls.json.user.id;

  const loginRes = fakeRes();
  await loginPost(fakeReq({ identifier: email, password }, ip), loginRes);
  assert.equal(loginRes.calls.json.ok, true, JSON.stringify(loginRes.calls.json));
  assert.equal(loginRes.calls.headers["Set-Cookie"].length, 3);

  // Login revokes prior refresh tokens (the one from register) and issues exactly one new one.
  const tokens = await prisma.refreshToken.findMany({ where: { userId } });
  const active = tokens.filter((t) => !t.revokedAt);
  assert.equal(active.length, 1, "exactly one active refresh token must remain after a login");
});

test("loginPost bumps sessionVersion on every successful login", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const email = `sessiss_${suffix}@gmail.com`;
  const password = "supersecret1";
  const ip = randomIp();

  const regRes = fakeRes();
  await registerPost(fakeReq(newRegBody(suffix), ip), regRes);
  const userId = regRes.calls.json.user.id;
  const afterRegister = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  await loginPost(fakeReq({ identifier: email, password }, ip), fakeRes());
  const afterLogin = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(afterLogin.sessionVersion, afterRegister.sessionVersion + 1);
});

test("loginPost does not clear a prior IP failed-login counter on success", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const email = `sessiss_${suffix}@gmail.com`;
  const password = "supersecret1";
  const ip = randomIp();

  const regRes = fakeRes();
  await registerPost(fakeReq(newRegBody(suffix), ip), regRes);
  assert.equal(regRes.calls.status, 201);

  // Fail twice against an unrelated identifier from the same IP (below the 5-attempt lockout
  // tier, so the account itself never locks — only the IP-keyed failCount accumulates).
  await recordAuthLoginFailure({ ip, userId: null });
  await recordAuthLoginFailure({ ip, userId: null });
  assert.equal(await ipFailCount(ip), 2, "setup: IP must show 2 recorded failures before the real login");

  const loginRes = fakeRes();
  await loginPost(fakeReq({ identifier: email, password }, ip), loginRes);
  assert.equal(loginRes.calls.json.ok, true, JSON.stringify(loginRes.calls.json));

  assert.equal(await ipFailCount(ip), 2, "a successful login must leave the IP spray counter in place");
});

test("registerPost does not clear a prior IP failed-login counter on success", async () => {
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString("hex");
  const ip = randomIp();

  await recordAuthLoginFailure({ ip, userId: null });
  await recordAuthLoginFailure({ ip, userId: null });
  assert.equal(await ipFailCount(ip), 2, "setup: IP must show 2 recorded failures before registering");

  const res = fakeRes();
  await registerPost(fakeReq(newRegBody(suffix), ip), res);
  assert.equal(res.calls.status, 201, JSON.stringify(res.calls.json));

  assert.equal(await ipFailCount(ip), 2, "registering must not wipe IP spray attempts from the same address");
});
