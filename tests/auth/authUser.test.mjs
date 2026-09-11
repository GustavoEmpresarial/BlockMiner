import test from "node:test";
import assert from "node:assert/strict";

// Real-Postgres tests for authUser.ts (zero prior coverage) — the auth-user lookup cache and
// ban-enforcement logic shared by core auth middleware, session, users, and admin.
const prisma = (await import("../../server/core/database/prisma.ts")).default;
const authUser = await import("../../server/shared/security/authUser.ts");

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `authuser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "AuthUser Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.90",
      ip: "203.0.113.90",
      userAgent: "test-agent/1.0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("getAuthUserById: invalid ids (non-numeric, zero, negative) return null without touching the DB", async () => {
  assert.equal(await authUser.getAuthUserById(Number.NaN), null);
  assert.equal(await authUser.getAuthUserById(0), null);
  assert.equal(await authUser.getAuthUserById(-5), null);
});

test("getAuthUserById: returns null for a userId that doesn't exist, and caches that null", async () => {
  const missingId = 999_999_999;
  const first = await authUser.getAuthUserById(missingId);
  assert.equal(first, null);
  // Cached null must still be returned (not re-queried) — no direct way to assert "no query
  // happened" without a DB spy, so this just pins the observable contract.
  const second = await authUser.getAuthUserById(missingId);
  assert.equal(second, null);
});

test("getAuthUserById: returns the real user row (selected fields) and caches it until invalidated", async () => {
  const user = await makeUser({ polBalance: "12.5" });
  const first = await authUser.getAuthUserById(user.id);
  assert.equal(first.id, user.id);
  assert.equal(first.email, user.email);
  assert.equal(Number(first.polBalance), 12.5);

  // Mutate the DB directly (bypassing the cache-invalidating helper) — the cached copy must
  // still be served until invalidateAuthUserCache() is called.
  await prisma.user.update({ where: { id: user.id }, data: { polBalance: "999" } });
  const stillCached = await authUser.getAuthUserById(user.id);
  assert.equal(Number(stillCached.polBalance), 12.5, "must serve the cached value before invalidation");

  authUser.invalidateAuthUserCache(user.id);
  const fresh = await authUser.getAuthUserById(user.id);
  assert.equal(Number(fresh.polBalance), 999, "must re-fetch from DB after invalidation");
});

test("updateUserLoginMeta: updates ip/userAgent/lastLoginAt on the row, and invalidates the auth-user cache", async () => {
  const user = await makeUser({ polBalance: "1" });
  await authUser.getAuthUserById(user.id); // warm the cache

  // A change made directly in the DB (bypassing the invalidating helper) while polBalance
  // isn't part of updateUserLoginMeta's own update — this isolates "did the cache actually
  // get invalidated" from "did the update itself write the right ip/userAgent/lastLoginAt".
  await prisma.user.update({ where: { id: user.id }, data: { polBalance: "777" } });

  const updated = await authUser.updateUserLoginMeta(user.id, { ip: "198.51.100.7", userAgent: "new-agent" });
  assert.equal(updated.ip, "198.51.100.7");
  assert.equal(updated.userAgent, "new-agent");
  assert.ok(updated.lastLoginAt instanceof Date);

  const fresh = await authUser.getAuthUserById(user.id);
  assert.equal(Number(fresh.polBalance), 777, "the cache must have been invalidated by updateUserLoginMeta");
});

test("checkBanOrExpire: not banned -> NOT_BANNED shape", async () => {
  const user = await makeUser();
  const status = await authUser.checkBanOrExpire(user.id);
  assert.deepEqual(status, { banned: false, reason: null, until: null, permanent: false });
});

test("checkBanOrExpire: permanently banned (no bannedUntil) reports permanent:true", async () => {
  const user = await makeUser({ isBanned: true, banReason: "fraude", bannedUntil: null });
  const status = await authUser.checkBanOrExpire(user.id);
  assert.equal(status.banned, true);
  assert.equal(status.permanent, true);
  assert.equal(status.reason, "fraude");
});

test("checkBanOrExpire: temporarily banned with a future bannedUntil stays banned", async () => {
  const future = new Date(Date.now() + 3_600_000);
  const user = await makeUser({ isBanned: true, banReason: "abuso", bannedUntil: future });
  const status = await authUser.checkBanOrExpire(user.id);
  assert.equal(status.banned, true);
  assert.equal(status.permanent, false);
  assert.equal(status.until.getTime(), future.getTime());
});

test("checkBanOrExpire: an expired temporary ban auto-lifts (clears isBanned in the DB) and returns NOT_BANNED", async () => {
  const past = new Date(Date.now() - 60_000);
  const user = await makeUser({ isBanned: true, banReason: "expirado", bannedUntil: past });
  const status = await authUser.checkBanOrExpire(user.id);
  assert.deepEqual(status, { banned: false, reason: null, until: null, permanent: false });

  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(fresh.isBanned, false, "the ban must actually be lifted in the DB, not just reported as expired");
  assert.equal(fresh.banReason, null);
});

test("checkBanOrExpire: nonexistent user is treated as NOT_BANNED (never throws)", async () => {
  const status = await authUser.checkBanOrExpire(999_999_998);
  assert.deepEqual(status, { banned: false, reason: null, until: null, permanent: false });
});

test("bannedResponseBody: permanent vs temporary messages and field shape", () => {
  const permanent = authUser.bannedResponseBody({ banned: true, reason: "r1", until: null, permanent: true });
  assert.equal(permanent.code, "ACCOUNT_DISABLED");
  assert.match(permanent.message, /permanentemente/);
  assert.equal(permanent.bannedUntil, null);

  const until = new Date("2030-01-01T00:00:00.000Z");
  const temp = authUser.bannedResponseBody({ banned: true, reason: "r2", until, permanent: false });
  assert.match(temp.message, /temporariamente/);
  assert.equal(temp.bannedUntil, until.toISOString());
});
