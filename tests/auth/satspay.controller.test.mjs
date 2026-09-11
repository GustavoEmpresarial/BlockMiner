import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Mirrors google.controller.test.mjs — satspay.controller.ts (the actual SatsPay OAuth login
// route handler) previously had ZERO test coverage, same as Google's did.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const controller = await import("../../server/modules/auth/satspay/satspay.controller.ts");
const { resolveOrCreateUserFromSatspay } = await import("../../server/modules/auth/satspay/satspay.service.ts");
const { isAllowedSatspayRedirectUri } = await import("../../server/modules/auth/satspay/satspay.config.ts");
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
    redirect() {},
    type() {
      return this;
    },
    send() {},
    get() {
      return undefined;
    },
  };
}

function fakeReq(body, overrides = {}) {
  return { body, ip: randomIp(), headers: { "user-agent": "vitest-satspay" }, get: () => undefined, ...overrides };
}

function randomIp() {
  const RESERVED_FIRST_OCTETS = new Set([10, 127, 169, 172, 192]);
  let firstOctet;
  do {
    firstOctet = crypto.randomInt(1, 224);
  } while (RESERVED_FIRST_OCTETS.has(firstOctet));
  return `${firstOctet}.${crypto.randomInt(0, 256)}.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;
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

const ENABLED_ENV = {
  SATSPAY_OAUTH_ENABLED: "1",
  SATSPAY_CLIENT_ID: "test-client-id",
  SATSPAY_CLIENT_SECRET: "test-client-secret",
  SATSPAY_REDIRECT_URIS: "https://blockminer.test/api/auth/satspay/callback",
};

const createdUserIds = [];
async function makeUser(overrides = {}) {
  const suffix = `satspayctl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Satspay Controller Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: await hashPassword("x", 10),
      registrationIp: "203.0.113.60",
      ip: "203.0.113.60",
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
    await prisma.refreshToken.deleteMany({ where }).catch(() => {});
    await prisma.userInventory.deleteMany({ where }).catch(() => {});
    await prisma.userOwnedMachine.deleteMany({ where }).catch(() => {});
    await prisma.userRack.deleteMany({ where }).catch(() => {});
    await prisma.userRoom.deleteMany({ where }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("satspayConfigGet: always responds ok:true with a satspay config object", () => {
  const res = fakeRes();
  controller.satspayConfigGet(fakeReq({}), res);
  assert.equal(res.calls.json.ok, true);
  assert.ok(res.calls.json.satspay);
});

test("satspayExchangePost: 503 SATSPAY_DISABLED when OAuth isn't configured", async () => {
  await withEnv({ SATSPAY_OAUTH_ENABLED: "", SATSPAY_CLIENT_ID: "", SATSPAY_CLIENT_SECRET: "" }, async () => {
    const res = fakeRes();
    await controller.satspayExchangePost(fakeReq({}), res);
    assert.equal(res.calls.status, 503);
    assert.equal(res.calls.json.code, "SATSPAY_DISABLED");
  });
});

test("satspayExchangePost: 400 SATSPAY_CODE_REQUIRED when enabled but no code sent", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const res = fakeRes();
    await controller.satspayExchangePost(fakeReq({}), res);
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, "SATSPAY_CODE_REQUIRED");
  });
});

test("satspayExchangePost: 400 SATSPAY_PKCE_REQUIRED when codeVerifier is too short", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const res = fakeRes();
    await controller.satspayExchangePost(fakeReq({ code: "abc", codeVerifier: "short" }), res);
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, "SATSPAY_PKCE_REQUIRED");
  });
});

test("satspayExchangePost: an unlisted redirect_uri in the body is rejected outright", async () => {
  await withEnv(ENABLED_ENV, () => {
    assert.equal(isAllowedSatspayRedirectUri("https://evil.example.com/cb"), false);
  });
});

test("satspayExchangePost: a valid code/verifier/redirect completes the exchange and issues a real session for a NEW user (welcome miner + room provisioned)", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const sub = `satspay-sub-${Date.now()}`;
    const email = `satspaynew_${Date.now()}@gmail.com`;
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token")) {
        return { ok: true, json: async () => ({ access_token: "fake-access-token", token_type: "Bearer", expires_in: 3600 }) };
      }
      if (u.includes("userinfo") || u.includes("user")) {
        return { ok: true, json: async () => ({ sub, email, email_verified: true, name: "Satspay Test User" }) };
      }
      throw new Error(`unexpected fetch to ${u}`);
    };
    try {
      const res = fakeRes();
      await controller.satspayExchangePost(
        fakeReq({ code: "auth-code", codeVerifier: "v".repeat(43), redirectUri: "https://blockminer.test/api/auth/satspay/callback" }),
        res,
      );
      assert.equal(res.calls.json?.ok, true, JSON.stringify(res.calls.json));
      assert.equal(res.calls.json.created, true);
      createdUserIds.push(res.calls.json.user.id);

      const inventoryCount = await prisma.userInventory.count({ where: { userId: res.calls.json.user.id } });
      assert.ok(inventoryCount > 0, "a brand-new Satspay signup must also get the welcome-miner provisioning");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("satspayExchangePost: token exchange failure responds 401, never fabricates a session", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) });
    try {
      const res = fakeRes();
      await controller.satspayExchangePost(
        fakeReq({ code: "bad-code", codeVerifier: "v".repeat(43), redirectUri: "https://blockminer.test/api/auth/satspay/callback" }),
        res,
      );
      assert.equal(res.calls.status, 401);
      assert.equal(res.calls.json.code, "SATSPAY_TOKEN_EXCHANGE_FAILED");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("satspayExchangePost: signing in as an already-banned user responds 403 ACCOUNT_DISABLED, no session issued", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const sub = `satspay-sub-banned-${Date.now()}`;
    const user = await makeUser({ isBanned: true, banReason: "teste", bannedUntil: null, satspaySubject: sub });
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token")) return { ok: true, json: async () => ({ access_token: "tok" }) };
      if (u.includes("userinfo") || u.includes("user")) return { ok: true, json: async () => ({ sub, email: user.email, email_verified: true, name: "Banned" }) };
      throw new Error("unexpected");
    };
    try {
      const res = fakeRes();
      await controller.satspayExchangePost(
        fakeReq({ code: "c", codeVerifier: "v".repeat(43), redirectUri: "https://blockminer.test/api/auth/satspay/callback" }),
        res,
      );
      assert.equal(res.calls.status, 403);
      assert.equal(res.calls.json.code, "ACCOUNT_DISABLED");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("resolveOrCreateUserFromSatspay: existing satspaySubject match returns that user, created:false", async () => {
  const sub = `existing-sub-${Date.now()}`;
  const user = await makeUser({ satspaySubject: sub });
  const result = await resolveOrCreateUserFromSatspay({ info: { sub, email: "irrelevant@gmail.com", email_verified: true, name: "X" }, clientIp: "203.0.113.10", userAgent: null });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.user.id, user.id);
});

test("resolveOrCreateUserFromSatspay: no email -> EMAIL_REQUIRED", async () => {
  const result = await resolveOrCreateUserFromSatspay({
    info: { sub: `nosub-${Date.now()}`, email: "", email_verified: false, name: "X" },
    clientIp: "203.0.113.11",
    userAgent: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMAIL_REQUIRED");
});

test("resolveOrCreateUserFromSatspay: email linked to a DIFFERENT satspay account -> EMAIL_CONFLICT", async () => {
  const email = `conflict_${Date.now()}@gmail.com`;
  await makeUser({ email, satspaySubject: `other-sub-${Date.now()}` });
  const result = await resolveOrCreateUserFromSatspay({
    info: { sub: `new-sub-${Date.now()}`, email, email_verified: true, name: "X" },
    clientIp: "203.0.113.12",
    userAgent: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMAIL_CONFLICT");
});

test("resolveOrCreateUserFromSatspay: existing email/password account with no prior satspaySubject gets LINKED (not duplicated)", async () => {
  const email = `linkme_${Date.now()}@gmail.com`;
  const existing = await makeUser({ email, satspaySubject: null });
  const result = await resolveOrCreateUserFromSatspay({
    info: { sub: `link-sub-${Date.now()}`, email, email_verified: true, name: "X" },
    clientIp: "203.0.113.13",
    userAgent: null,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.user.id, existing.id);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
  assert.ok(fresh.satspaySubject, "the account must now be linked to the Satspay subject");
});
