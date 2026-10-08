import { test, describe } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../server/core/database/prisma.ts";
import { runShowcase3dPurgeAndRefundMigration, SHOWCASE_3D_PURGE_MINER_ACTION, SHOWCASE_3D_RACK_REFUND_ACTION } from "../../server/modules/rooms/rooms.showcasePurge.ts";

const dbUrl = process.env.DATABASE_URL ?? "";
const hasDb =
  dbUrl.includes("127.0.0.1") ||
  dbUrl.includes("localhost") ||
  dbUrl.includes("blockminer_dev");

describe("showcase 3D purge and refund migration", { skip: !hasDb && "local DATABASE_URL required" }, () => {
  async function makeTestUser(startingBlk = 10) {
    const rnd = Math.random().toString(36).slice(2, 8);
    const suffix = `${Date.now()}_${rnd}`;
    const user = await prisma.user.create({
      data: {
        name: `Purge User ${rnd}`,
        email: `purge_${suffix}@test.local`,
        username: `prg_${rnd}`,
        passwordHash: "hash",
        refCode: `R${rnd}`.toUpperCase(),
        blkBalance: startingBlk,
      },
    });
    return user;
  }

  test("evacuates miners from room 101 to inventory, refunds BLK, and deletes room 101", async () => {
    const user = await makeTestUser(5.0);
    const userId = user.id;

    // Create room 101 for user
    const room = await prisma.userRoom.create({
      data: {
        userId,
        roomNumber: 101,
        kind: "showcase_3d",
        pricePaid: 0,
      },
    });

    // Create a 3D miner installed on a rack in room 101
    const miner = await prisma.miner.create({
      data: {
        name: "Test 3D MCX9",
        slug: `test-3d-mcx9-${Date.now()}`,
        baseHashRate: 300,
        slotSize: 1,
        price: 10,
        imageUrl: "/media/models/minercore-mcx9.glb",
      },
    });

    const userMiner = await prisma.userMiner.create({
      data: {
        userId,
        minerId: miner.id,
        slotIndex: 0,
        hashRate: 300,
        level: 1,
        slotSize: 1,
      },
    });

    const rack = await prisma.userRack.create({
      data: {
        userId,
        roomId: room.id,
        position: 0,
        userMinerId: userMiner.id,
        installedAt: new Date(),
      },
    });

    await prisma.userVisualRackPlacement.create({
      data: {
        userId,
        roomId: room.id,
        visualIndex: 0,
        floorSlot: 0,
      },
    });

    // Record an idempotency purchase for this user of 1.90 BLK
    await prisma.callbackQueue.create({
      data: {
        userId,
        callbackType: "SEC_IDEM",
        callbackHash: `test_idem_${userId}`,
        status: "processed",
        data: {
          phase: "done",
          responseJson: {
            messageKey: "racks.showcase_3d_purchase_success",
            totalPrice: "1.90000000",
          },
        },
      },
    });

    // Run purge migration
    const outcome = await runShowcase3dPurgeAndRefundMigration({ execute: true });
    assert.equal(outcome.dryRun, false);
    assert.ok(outcome.minersEvacuated >= 1);

    // Verify miner is now in user_inventory
    const inventoryItems = await prisma.userInventory.findMany({
      where: { userId },
    });
    assert.ok(inventoryItems.length >= 1);
    assert.equal(inventoryItems[0].minerId, miner.id);

    // Verify user BLK was refunded: 5.0 + 1.9 = 6.9
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    assert.ok(Number(updatedUser.blkBalance) >= 6.89);

    // Verify audit logs
    const purgeAudit = await prisma.auditLog.findFirst({
      where: { userId, action: SHOWCASE_3D_PURGE_MINER_ACTION },
    });
    assert.ok(purgeAudit);

    const refundAudit = await prisma.auditLog.findFirst({
      where: { userId, action: SHOWCASE_3D_RACK_REFUND_ACTION },
    });
    assert.ok(refundAudit);

    // Verify room 101 and racks are gone
    const remainingRooms = await prisma.userRoom.findMany({
      where: { userId, roomNumber: 101 },
    });
    assert.equal(remainingRooms.length, 0);

    const remainingRacks = await prisma.userRack.findMany({
      where: { id: rack.id },
    });
    assert.equal(remainingRacks.length, 0);

    // Run a second time: idempotent, no duplicate refund
    const secondOutcome = await runShowcase3dPurgeAndRefundMigration({ execute: true });
    assert.equal(secondOutcome.minersEvacuated, 0);

    const userAfterSecond = await prisma.user.findUnique({
      where: { id: userId },
    });
    assert.equal(Number(userAfterSecond.blkBalance), Number(updatedUser.blkBalance));

    // Cleanup test data
    await prisma.userInventory.deleteMany({ where: { userId } });
    await prisma.callbackQueue.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.miner.delete({ where: { id: miner.id } });
  });
});
