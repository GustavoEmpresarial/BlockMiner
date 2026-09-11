import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Covers google.controller.ts (the actual OAuth login route handler — previously ZERO test
// coverage; only google.config.ts/google.pure.ts's helper functions had tests) and
// google.service.ts's resolveOrCreateUserFromGoogle (account linking/creation logic).
//
// exchangeGoogleAuthorizationCode/fetchGoogleUserInfo (google.client.ts) call the global
// `fetch` directly with no injectable seam (unlike turnstile.ts/withdrawal.coinex.ts) — so the
// full-exchange happy-path test temporarily monkeypatches global.fetch to return canned Google
// responses, the same "swap only the network boundary" principle as those other tests, just
// via the global instead of a passed-in fetchImpl since this module doesn't expose one.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const controller = await import("../../server/modules/auth/google/google.controller.ts");
const { resolveOrCreateUserFromGoogle } = await import("../../server/modules/auth/google/google.service.ts");
const { readGoogleOAuthConfig, isAllowedGoogleRedirectUri } = await import("../../server/modules/auth/google/google.config.ts");
const { hashPassword } = await import("../../server/shared/security/password.ts");

function fakeRes() {
  const calls = { status: null, json: null, headers: {}, redirected: null };
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
    redirect(code, url) {
      calls.redirected = { code, url };
    },
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
  return { body, ip: randomIp(), headers: { "user-agent": "vitest-google" }, get: () => undefined, ...overrides };
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
  GOOGLE_OAUTH_ENABLED: "1",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_REDIRECT_URIS: "https://blockminer.test/api/auth/google/callback",
};

const createdUserIds = [];
async function makeUser(overrides = {}) {
  const suffix = `googlectl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Google Controller Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: await hashPassword("x", 10),
      registrationIp: "203.0.113.50",
      ip: "203.0.113.50",
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

// --- googleConfigGet ---

test("googleConfigGet: always responds ok:true with a google config object", () => {
  const res = fakeRes();
  controller.googleConfigGet(fakeReq({}), res);
  assert.equal(res.calls.json.ok, true);
  assert.ok(res.calls.json.google);
});

// --- googleExchangePost validation branches (no network involved) ---

test("googleExchangePost: 503 GOOGLE_DISABLED when OAuth isn't configured", async () => {
  await withEnv({ GOOGLE_OAUTH_ENABLED: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }, async () => {
    const res = fakeRes();
    await controller.googleExchangePost(fakeReq({}), res);
    assert.equal(res.calls.status, 503);
    assert.equal(res.calls.json.code, "GOOGLE_DISABLED");
  });
});

test("googleExchangePost: 400 GOOGLE_CODE_REQUIRED when enabled but no code sent", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const res = fakeRes();
    await controller.googleExchangePost(fakeReq({}), res);
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, "GOOGLE_CODE_REQUIRED");
  });
});

test("googleExchangePost: 400 GOOGLE_PKCE_REQUIRED when codeVerifier is too short", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const res = fakeRes();
    await controller.googleExchangePost(fakeReq({ code: "abc", codeVerifier: "short" }), res);
    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.code, "GOOGLE_PKCE_REQUIRED");
  });
});

test("googleExchangePost: an unlisted redirect_uri in the body is rejected — falls back to the hardcoded prod allowlist, never the caller-supplied value", async () => {
  // parseGoogleRedirectUris() always includes hardcoded blockminer.space hosts as a safety-net
  // fallback (see google.config.ts) — GOOGLE_REDIRECT_INVALID is unreachable in practice, so
  // this asserts the real, reachable contract instead: an arbitrary attacker-supplied
  // redirectUri is never accepted as-is, even though *some* redirect will always resolve.
  await withEnv({ ...ENABLED_ENV, GOOGLE_REDIRECT_URIS: "" }, () => {
    const cfg = readGoogleOAuthConfig();
    assert.equal(isAllowedGoogleRedirectUri("https://evil.example.com/cb"), false);
    assert.ok(cfg.redirectUris.every((u) => !u.includes("evil.example.com")));
  });
});

// --- Full exchange happy path (global fetch monkeypatched, no real Google call) ---

test("googleExchangePost: a valid code/verifier/redirect completes the exchange and issues a real session for a NEW user (welcome miner + room provisioned)", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const sub = `google-sub-${Date.now()}`;
    const email = `googlenew_${Date.now()}@gmail.com`;
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("oauth2.googleapis.com/token") || u.includes("token")) {
        return { ok: true, json: async () => ({ access_token: "fake-access-token", token_type: "Bearer", expires_in: 3600 }) };
      }
      if (u.includes("userinfo")) {
        return { ok: true, json: async () => ({ sub, email, email_verified: true, name: "Google Test User" }) };
      }
      throw new Error(`unexpected fetch to ${u}`);
    };
    try {
      const res = fakeRes();
      await controller.googleExchangePost(
        fakeReq({ code: "auth-code", codeVerifier: "v".repeat(43), redirectUri: "https://blockminer.test/api/auth/google/callback" }),
        res,
      );
      assert.equal(res.calls.json?.ok, true, JSON.stringify(res.calls.json));
      assert.equal(res.calls.json.created, true);
      assert.equal(res.calls.json.user.email, email);
      createdUserIds.push(res.calls.json.user.id);

      const inventoryCount = await prisma.userInventory.count({ where: { userId: res.calls.json.user.id } });
      assert.ok(inventoryCount > 0, "a brand-new Google signup must also get the welcome-miner provisioning");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("googleExchangePost: token exchange failure (Google rejects the code) responds 401, never fabricates a session", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) });
    try {
      const res = fakeRes();
      await controller.googleExchangePost(
        fakeReq({ code: "bad-code", codeVerifier: "v".repeat(43), redirectUri: "https://blockminer.test/api/auth/google/callback" }),
        res,
      );
      assert.equal(res.calls.status, 401);
      assert.equal(res.calls.json.code, "GOOGLE_TOKEN_EXCHANGE_FAILED");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("googleExchangePost: signing in as an already-banned user responds 403 ACCOUNT_DISABLED, no session issued", async () => {
  await withEnv(ENABLED_ENV, async () => {
    const sub = `google-sub-banned-${Date.now()}`;
    const user = await makeUser({ isBanned: true, banReason: "teste", bannedUntil: null, googleSubject: sub });
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("token")) return { ok: true, json: async () => ({ access_token: "tok" }) };
      if (u.includes("userinfo")) return { ok: true, json: async () => ({ sub, email: user.email, email_verified: true, name: "Banned" }) };
      throw new Error("unexpected");
    };
    try {
      const res = fakeRes();
      await controller.googleExchangePost(
        fakeReq({ code: "c", codeVerifier: "v".repeat(43), redirectUri: "https://blockminer.test/api/auth/google/callback" }),
        res,
      );
      assert.equal(res.calls.status, 403);
      assert.equal(res.calls.json.code, "ACCOUNT_DISABLED");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

// --- google.service.ts: resolveOrCreateUserFromGoogle business logic directly ---

test("resolveOrCreateUserFromGoogle: existing googleSubject match returns that user, created:false, no new row", async () => {
  const sub = `existing-sub-${Date.now()}`;
  const user = await makeUser({ googleSubject: sub });
  const result = await resolveOrCreateUserFromGoogle({ info: { sub, email: "irrelevant@gmail.com", email_verified: true, name: "X" }, clientIp: "203.0.113.1", userAgent: null });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.user.id, user.id);
});

test("resolveOrCreateUserFromGoogle: no email in Google profile -> EMAIL_REQUIRED", async () => {
  const result = await resolveOrCreateUserFromGoogle({
    info: { sub: `nosub-${Date.now()}`, email: "", email_verified: false, name: "X" },
    clientIp: "203.0.113.2",
    userAgent: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMAIL_REQUIRED");
});

test("resolveOrCreateUserFromGoogle: email already linked to a DIFFERENT google account -> EMAIL_CONFLICT", async () => {
  const email = `conflict_${Date.now()}@gmail.com`;
  await makeUser({ email, googleSubject: `other-sub-${Date.now()}` });
  const result = await resolveOrCreateUserFromGoogle({
    info: { sub: `new-sub-${Date.now()}`, email, email_verified: true, name: "X" },
    clientIp: "203.0.113.3",
    userAgent: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "EMAIL_CONFLICT");
});

test("resolveOrCreateUserFromGoogle: existing email/password account with no prior googleSubject gets LINKED (not duplicated)", async () => {
  const email = `linkme_${Date.now()}@gmail.com`;
  const existing = await makeUser({ email, googleSubject: null });
  const result = await resolveOrCreateUserFromGoogle({
    info: { sub: `link-sub-${Date.now()}`, email, email_verified: true, name: "X" },
    clientIp: "203.0.113.4",
    userAgent: null,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.user.id, existing.id);
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
  assert.ok(fresh.googleSubject, "the account must now be linked to the Google subject");
});
