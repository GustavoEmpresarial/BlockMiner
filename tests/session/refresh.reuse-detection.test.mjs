import test from "node:test";
import assert from "node:assert/strict";

// Security regression (2026-09-11): replaying an already-rotated (revoked) refresh token
// used to just reject that one request — the rest of the user's refresh-token chain (the
// legitimate successor token, and any other device's tokens) stayed valid. Per OWASP's
// refresh-token-rotation guidance, reuse of a revoked token is treated as a signal the token
// leaked, and the fix revokes every refresh token that user holds ("assume compromise").
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { refreshPost } = await import("../../server/modules/session/session.refresh.controller.ts");
const { createRefreshToken } = await import("../../server/shared/security/authTokens.ts");
const { createRefreshTokenRecord, revokeRefreshToken } = await import("../../server/modules/session/session.tokens.ts");
const { hashPassword } = await import("../../server/shared/security/password.ts");

function fakeRes() {
  const calls = { status: null, json: null, headers: {} };
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
    setHeader(name, value) {
      calls.headers[name] = value;
      return this;
    },
    getHeader(name) {
      return calls.headers[name];
    },
  };
}

function fakeReq(refreshTokenRaw) {
  return {
    headers: { cookie: `blockminer_refresh=${encodeURIComponent(refreshTokenRaw)}`, "user-agent": "vitest" },
    ip: "203.0.113.77",
    get: () => undefined,
  };
}

const createdUserIds = [];
async function makeUser() {
  const suffix = `refreshreuse_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Refresh Reuse Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: await hashPassword("x", 4),
      registrationIp: "203.0.113.77",
      ip: "203.0.113.77",
      userAgent: "vitest",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) {
    const where = { userId: { in: createdUserIds } };
    await prisma.refreshToken.deleteMany({ where }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("refreshPost: replaying an already-rotated refresh token revokes ALL of that user's refresh tokens, not just the reused one", async () => {
  const user = await makeUser();

  // Simulate two devices/sessions already having live refresh tokens for this user.
  const tokenA = createRefreshToken();
  await createRefreshTokenRecord({ userId: user.id, ...tokenA, createdAt: Date.now() });
  const tokenB = createRefreshToken();
  await createRefreshTokenRecord({ userId: user.id, ...tokenB, createdAt: Date.now() });

  // tokenA gets used and rotated normally (its own successor).
  const successorOfA = createRefreshToken();
  await createRefreshTokenRecord({ userId: user.id, ...successorOfA, createdAt: Date.now() });
  await revokeRefreshToken({ tokenId: tokenA.tokenId, revokedAt: Date.now(), replacedBy: successorOfA.tokenId });

  // Now an attacker (or a race) replays the already-rotated tokenA.
  const res = fakeRes();
  await refreshPost(fakeReq(tokenA.token), res);
  assert.equal(res.calls.status, 401);
  assert.equal(res.calls.json.code, "REFRESH_REVOKED");

  // Every refresh token this user holds — including tokenB (a completely different device)
  // and successorOfA (the legitimate rotation target) — must now be revoked.
  const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
  const byId = Object.fromEntries(rows.map((r) => [r.tokenId, r]));
  assert.ok(byId[tokenB.tokenId].revokedAt, "an unrelated device's refresh token must be revoked too");
  assert.ok(byId[successorOfA.tokenId].revokedAt, "the legitimate rotated successor must be revoked too");
});

test("refreshPost: a token that never existed (garbage/forged) is rejected without touching any real token rows", async () => {
  const user = await makeUser();
  const liveToken = createRefreshToken();
  await createRefreshTokenRecord({ userId: user.id, ...liveToken, createdAt: Date.now() });

  const res = fakeRes();
  await refreshPost(fakeReq("00000000-0000-0000-0000-000000000000.deadbeef"), res);
  assert.equal(res.calls.status, 401);

  const row = await prisma.refreshToken.findUnique({ where: { tokenId: liveToken.tokenId } });
  assert.equal(row.revokedAt, null, "an unrelated real token must not be revoked by a forged one");
});
