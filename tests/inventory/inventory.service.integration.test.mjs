/**
 * Live-DB integration test for what's left of inventory.service.ts after the
 * dead-code cleanup (see inventory.routes.ts header): listing a user's backpack, and
 * the cross-module grant entry point every purchase/reward path funnels through.
 * Requires DATABASE_URL; skips itself otherwise. Creates disposable users, always
 * cleans up in `after`.
 */
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("inventory.service — live DB integration", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let prisma;
  let inventoryService;
  const createdUserIds = [];

  before(async () => {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    inventoryService = await import("../../server/modules/inventory/inventory.service.ts");
  });

  after(async () => {
    for (const userId of createdUserIds) {
      await prisma.userInventory.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  async function makeUser() {
    const tag = `integration-test-inventory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: { name: tag, email: `${tag}@blockminer.test`, passwordHash: "x", polBalance: 0 },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  test("listInventoryForUser returns an empty array for a fresh user with no items", async () => {
    const userId = await makeUser();
    const items = await inventoryService.listInventoryForUser(userId);
    assert.deepEqual(items, []);
  });

  test("grantPurchasedInventoryItems creates exactly `quantity` rows, each resolvable via listInventoryForUser", async () => {
    const userId = await makeUser();
    await prisma.$transaction(async (tx) => {
      await inventoryService.grantPurchasedInventoryItems(
        tx,
        userId,
        { minerId: null, minerName: "Granted Miner", hashRate: 250, slotSize: 2, imageUrl: "/media/miners/x.webp" },
        3,
        new Date(),
      );
    });

    const items = await inventoryService.listInventoryForUser(userId);
    assert.equal(items.length, 3);
    for (const item of items) {
      assert.equal(item.minerName, "Granted Miner");
      assert.equal(item.hashRate, 250);
      assert.equal(item.slotSize, 2);
      assert.equal(item.imageUrl, "/media/miners/x.webp");
      assert.ok(item.ownedMachineId, "each granted item must have a linked UserOwnedMachine row");
    }
  });

  test("IDOR: listInventoryForUser never returns another user's rows", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    await prisma.$transaction(async (tx) => {
      await inventoryService.grantPurchasedInventoryItems(
        tx,
        userA,
        { minerId: null, minerName: "A's Miner", hashRate: 10, imageUrl: null },
        1,
        new Date(),
      );
    });

    const itemsForB = await inventoryService.listInventoryForUser(userB);
    assert.deepEqual(itemsForB, []);
    const itemsForA = await inventoryService.listInventoryForUser(userA);
    assert.equal(itemsForA.length, 1);
  });

  test("the brand-icon placeholder image is normalized to null, never leaked as a real image", async () => {
    const userId = await makeUser();
    await prisma.$transaction(async (tx) => {
      await inventoryService.grantPurchasedInventoryItems(
        tx,
        userId,
        { minerId: null, minerName: "Placeholder Miner", hashRate: 5, imageUrl: "/media/brand/icon.webp" },
        1,
        new Date(),
      );
    });
    const [item] = await inventoryService.listInventoryForUser(userId);
    assert.equal(item.imageUrl, null);
    assert.equal(item.imageSource, "none");
  });
});
