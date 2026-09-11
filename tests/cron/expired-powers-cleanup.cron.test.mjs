import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { cleanupExpiredPowers } = await import("../../server/cron/expired-powers-cleanup.cron.ts");

const createdUserIds = [];
const createdInventoryIds = [];

async function makeUser() {
  const suffix = `powcln_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Expired Powers Cleanup Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.40",
      ip: "203.0.113.40",
      userAgent: "test-agent/1.0",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeInventory(userId, expiresAt) {
  const row = await prisma.userInventory.create({
    data: {
      userId,
      minerName: "Test Miner",
      expiresAt,
    },
  });
  createdInventoryIds.push(row.id);
  return row;
}

test.after(async () => {
  await prisma.userInventory.deleteMany({ where: { id: { in: createdInventoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("cleanupExpiredPowers: deletes expired user_inventory rows, preserves non-expired and permanent (null expiresAt) ones", async () => {
  const user = await makeUser();
  const expired = await makeInventory(user.id, new Date(Date.now() - 60_000));
  const future = await makeInventory(user.id, new Date(Date.now() + 3_600_000));
  const permanent = await makeInventory(user.id, null);

  await cleanupExpiredPowers();

  const [expiredRow, futureRow, permanentRow] = await Promise.all([
    prisma.userInventory.findUnique({ where: { id: expired.id } }),
    prisma.userInventory.findUnique({ where: { id: future.id } }),
    prisma.userInventory.findUnique({ where: { id: permanent.id } }),
  ]);

  assert.equal(expiredRow, null, "expired inventory row must be deleted");
  assert.ok(futureRow, "non-expired inventory row must be preserved");
  assert.ok(permanentRow, "null-expiresAt (permanent) row must never match `lt: now` and must be preserved");
});

test("cleanupExpiredPowers: is idempotent — running twice does not error", async () => {
  const user = await makeUser();
  await makeInventory(user.id, new Date(Date.now() - 60_000));

  await assert.doesNotReject(cleanupExpiredPowers());
  await assert.doesNotReject(cleanupExpiredPowers());
});
