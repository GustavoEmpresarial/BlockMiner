import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

// Smoke suite: boots the REAL Express app (server/bootstrap/server.ts::createApp — the exact
// same wiring used in production, every router mounted) against a real Postgres and hits it
// over real HTTP. Purpose is narrow: fail fast and loud if any of the four critical surfaces —
// app/landing, login, register, auth 2.0 (Google/SatsPay) — is broken end-to-end (route not
// mounted, middleware throwing, JSON contract changed). This is NOT meant to replace the
// deeper unit/integration suites in tests/auth/* and tests/public-stats/* — it only asks
// "is the critical path alive at all?".

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { createApp } = await import("../../server/bootstrap/server.ts");
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { hashPassword } = await import("../../server/shared/security/password.ts");

// This suite drives the real HTTP router end-to-end (unlike the controller-level auth tests,
// which call loginPost/registerPost directly and never pass through requireTurnstileWhenConfigured).
// .env sets a real TURNSTILE_SECRET_KEY for local dev parity, loaded via `dotenv/config` as a
// side effect of the imports above; delete it only AFTER those imports run, or dotenv would
// just refill it since it never overrides an already-set var but freely sets an unset one.
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.TURNSTILE_SECRET_KEY_LOGIN;
delete process.env.TURNSTILE_SECRET_KEY_REGISTER;

async function withServer(fn) {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Real browsers get their CSRF cookie+token from any prior GET before a POST/PUT/DELETE;
// this smoke suite exercises the actual CSRF middleware the same way instead of bypassing it.
async function getCsrf(base) {
  const res = await fetch(`${base}/health`);
  const setCookie = res.headers.get("set-cookie") || "";
  const match = /blockminer_csrf=([^;]+)/.exec(setCookie);
  const token = match ? decodeURIComponent(match[1]) : null;
  assert.ok(token, "expected the CSRF middleware to hand out a blockminer_csrf cookie");
  return { cookie: `blockminer_csrf=${match[1]}`, token };
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
test.after(async () => {
  if (createdUserIds.length) {
    const where = { userId: { in: createdUserIds } };
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

// --- App / landing --------------------------------------------------------

test("smoke: /health responds ok", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });
});

test("smoke: landing page public data endpoints (public-stats, public-feed) respond 200 with the expected shape", async () => {
  await withServer(async (base) => {
    const stats = await fetch(`${base}/api/public-stats`);
    assert.equal(stats.status, 200);
    const statsBody = await stats.json();
    assert.equal(typeof statsBody, "object");

    const feed = await fetch(`${base}/api/public-feed`);
    assert.equal(feed.status, 200);
  });
});

// --- Login -----------------------------------------------------------------

test("smoke: POST /api/auth/login rejects a garbage body with a 400, not a 500 (route is alive and validating)", async () => {
  await withServer(async (base) => {
    const csrf = await getCsrf(base);
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp(), "x-csrf-token": csrf.token, cookie: csrf.cookie },
      body: JSON.stringify({}),
    });
    assert.ok(res.status === 400 || res.status === 422, `expected a validation error, got ${res.status}`);
  });
});

test("smoke: full login round-trip — a real seeded user can log in and gets a session cookie", async () => {
  await withServer(async (base) => {
    const suffix = `smoke_login_${Date.now()}`;
    const password = "Sm0ke-Test-P@ss!";
    const user = await prisma.user.create({
      data: {
        name: "Smoke Login",
        username: suffix,
        email: `${suffix}@blockminer.test`,
        passwordHash: await hashPassword(password, 10),
        emailVerifiedAt: new Date(),
        registrationIp: "203.0.113.20",
        ip: "203.0.113.20",
        userAgent: "smoke-test/1.0",
      },
    });
    createdUserIds.push(user.id);

    const csrf = await getCsrf(base);
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp(), "x-csrf-token": csrf.token, cookie: csrf.cookie },
      body: JSON.stringify({ identifier: user.email, password }),
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 200, `expected login 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(res.headers.get("set-cookie"), "expected a session cookie to be set on successful login");
  });
});

// --- Register ----------------------------------------------------------------

test("smoke: POST /api/auth/register rejects a garbage body with a 400 (route alive and validating)", async () => {
  await withServer(async (base) => {
    const csrf = await getCsrf(base);
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp(), "x-csrf-token": csrf.token, cookie: csrf.cookie },
      body: JSON.stringify({}),
    });
    assert.ok(res.status === 400 || res.status === 422, `expected a validation error, got ${res.status}`);
  });
});

test("smoke: full register round-trip — a brand-new user can sign up end-to-end", async () => {
  await withServer(async (base) => {
    const suffix = `smoke_reg_${Date.now()}`.slice(0, 24);
    const csrf = await getCsrf(base);
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp(), "x-csrf-token": csrf.token, cookie: csrf.cookie },
      body: JSON.stringify({
        username: suffix,
        email: `${suffix}@gmail.com`,
        password: "Sm0ke-Test-P@ss!",
        acceptTerms: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    assert.equal(res.status, 201, `expected register 201, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.user?.id, "expected a created user in the response");
    createdUserIds.push(body.user.id);
  });
});

// --- Auth 2.0 (Google / SatsPay OAuth) ----------------------------------------

test("smoke: GET /api/auth/google/config responds 200 with a public (secret-free) config", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/auth/google/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.google);
    assert.equal(JSON.stringify(body).includes("client_secret"), false);
  });
});

test("smoke: GET /api/auth/satspay/config responds 200 with a public (secret-free) config", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/auth/satspay/config`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.satspay);
    assert.equal(JSON.stringify(body).includes("client_secret"), false);
  });
});

test("smoke: POST /api/auth/google with no code is rejected (400/503), never a 500 or a fabricated session", async () => {
  await withServer(async (base) => {
    const csrf = await getCsrf(base);
    const res = await fetch(`${base}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp(), "x-csrf-token": csrf.token, cookie: csrf.cookie },
      body: JSON.stringify({}),
    });
    assert.ok([400, 422, 503].includes(res.status), `unexpected status ${res.status}`);
  });
});

test("smoke: POST /api/auth/satspay with no code is rejected (400/503), never a 500 or a fabricated session", async () => {
  await withServer(async (base) => {
    const csrf = await getCsrf(base);
    const res = await fetch(`${base}/api/auth/satspay`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp(), "x-csrf-token": csrf.token, cookie: csrf.cookie },
      body: JSON.stringify({}),
    });
    assert.ok([400, 422, 503].includes(res.status), `unexpected status ${res.status}`);
  });
});
