/**
 * Etapa B fixture: 3 users, 30× 3D miners in rooms 1–2 (worst user has 20).
 * Proves dry-run, execute, idempotency, and mid-run failure safety.
 * Local DB only. Never user 294.
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

const dbUrl = process.env.DATABASE_URL ?? "";
const PRODUCTION_MARKERS = [
  "blockminer.space",
  "89.167.119.164",
  "169.58.45.155",
  "blockminer-db",
  "161.97.176.125",
];
const unsafe = PRODUCTION_MARKERS.some((marker) => dbUrl.includes(marker));
const hasDb = Boolean(dbUrl) && !unsafe;

const HASH_RATE = 12_000;
const RACKS_PER_ROOM = Number.parseInt(process.env.RACKS_PER_ROOM || "192", 10);

describe("showcase 3D common-room migration (Etapa B)", { skip: !hasDb && "local DATABASE_URL required" }, () => {
  let prisma;
  let migration;
  let roomsService;
  const createdUserIds = [];

  before(async () => {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    migration = await import("../../server/modules/rooms/rooms.showcaseCommonMigration.ts");
    roomsService = await import("../../server/modules/rooms/rooms.service.ts");
  });

  async function wipeCreatedUsers() {
    const ids = createdUserIds.splice(0, createdUserIds.length);
    for (const userId of ids) {
      const email = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!email?.email?.endsWith("@blockminer.test") || !email.email.includes("migrate-3d-")) continue;
      await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRack.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userMiner.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userInventory.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRoom.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  }

  after(async () => {
    await wipeCreatedUsers();
    await prisma.$disconnect();
  });

  async function makeUser(tagSuffix) {
    const tag = `migrate-3d-${Date.now()}-${tagSuffix}-${Math.random().toString(36).slice(2, 6)}`;
    const user = await prisma.user.create({
      data: {
        name: tag,
        email: `${tag}@blockminer.test`,
        passwordHash: "x",
        polBalance: 0,
        blkBalance: "0",
      },
      select: { id: true },
    });
    assert.notEqual(user.id, 294);
    createdUserIds.push(user.id);
    return user.id;
  }

  async function ensureRoomSlots(userId, roomNumber, slotCount) {
    let room = await prisma.userRoom.findFirst({ where: { userId, roomNumber } });
    if (!room) {
      room = await prisma.userRoom.create({
        data: { userId, roomNumber, pricePaid: 0, kind: "standard" },
      });
    }
    const existing = await prisma.userRack.count({ where: { roomId: room.id } });
    for (let position = existing; position < slotCount; position += 1) {
      await prisma.userRack.create({
        data: { userId, roomId: room.id, position },
      });
    }
    return room.id;
  }

  async function plantInRoom(userId, roomNumber, count) {
    await ensureRoomSlots(userId, roomNumber, count);
    const racks = await prisma.userRack.findMany({
      where: { userId, userMinerId: null, room: { roomNumber } },
      orderBy: { position: "asc" },
      take: count,
    });
    assert.equal(racks.length, count);
    for (const rack of racks) {
      const slotIndex = 1000 + (roomNumber - 1) * RACKS_PER_ROOM + rack.position;
      const miner = await prisma.userMiner.create({
        data: {
          userId,
          slotIndex,
          hashRate: HASH_RATE,
          slotSize: 1,
          imageUrl: "/media/offers/minercore-mcx9.webp",
          isActive: true,
        },
      });
      await prisma.userRack.update({
        where: { id: rack.id },
        data: { userMinerId: miner.id, installedAt: new Date() },
      });
    }
  }

  /** 30 machines: userA 20 (12 room1 + 8 room2), userB 5 room1, userC 5 room2. */
  async function seedProductionShapedFixture() {
    const userA = await makeUser("a");
    const userB = await makeUser("b");
    const userC = await makeUser("c");
    await plantInRoom(userA, 1, 12);
    await plantInRoom(userA, 2, 8);
    await plantInRoom(userB, 1, 5);
    await plantInRoom(userC, 2, 5);
    return { userA, userB, userC };
  }

  test("dry-run lists 30 and writes nothing", async () => {
    try {
      const { userA, userB, userC } = await seedProductionShapedFixture();
      const beforeInv = await prisma.userInventory.count({
        where: { userId: { in: [userA, userB, userC] } },
      });
      const result = await migration.runShowcase3dCommonRoomMigration({ execute: false });
      assert.equal(result.dryRun, true);
      assert.equal(result.planned, 30);
      assert.equal(result.moved, 0);
      assert.equal(result.summaryBefore.machines3dInCommonRooms, 30);
      assert.equal(result.summaryBefore.distinctUsers, 3);
      assert.equal(result.summaryBefore.worstUser.machines, 20);
      const afterHits = await migration.listShowcase3dInCommonRooms();
      assert.equal(afterHits.length, 30);
      const afterInv = await prisma.userInventory.count({
        where: { userId: { in: [userA, userB, userC] } },
      });
      assert.equal(afterInv, beforeInv);
      const audits = await prisma.auditLog.count({
        where: {
          userId: { in: [userA, userB, userC] },
          action: migration.SHOWCASE_3D_COMMON_MIGRATE_AUDIT_ACTION,
        },
      });
      assert.equal(audits, 0);
    } finally {
      await wipeCreatedUsers();
    }
  });

  test("execute moves exactly 30 into the right inventories and is idempotent", async () => {
    try {
      const { userA, userB, userC } = await seedProductionShapedFixture();
      const first = await migration.runShowcase3dCommonRoomMigration({ execute: true });
      assert.equal(first.dryRun, false);
      assert.equal(first.planned, 30);
      assert.equal(first.moved, 30);
      assert.equal(first.remaining, 0);
      assert.equal(first.failures.length, 0);

      assert.equal(await prisma.userInventory.count({ where: { userId: userA } }), 20);
      assert.equal(await prisma.userInventory.count({ where: { userId: userB } }), 5);
      assert.equal(await prisma.userInventory.count({ where: { userId: userC } }), 5);
      assert.equal((await migration.listShowcase3dInCommonRooms()).length, 0);
      assert.equal(
        await prisma.auditLog.count({
          where: {
            userId: { in: [userA, userB, userC] },
            action: migration.SHOWCASE_3D_COMMON_MIGRATE_AUDIT_ACTION,
          },
        }),
        30,
      );

      const second = await migration.runShowcase3dCommonRoomMigration({ execute: true });
      assert.equal(second.planned, 0);
      assert.equal(second.moved, 0);
      assert.equal(second.remaining, 0);
      assert.equal(await prisma.userInventory.count({ where: { userId: userA } }), 20);
      assert.equal(await prisma.userInventory.count({ where: { userId: userB } }), 5);
      assert.equal(await prisma.userInventory.count({ where: { userId: userC } }), 5);
      assert.equal(
        await prisma.auditLog.count({
          where: {
            userId: { in: [userA, userB, userC] },
            action: migration.SHOWCASE_3D_COMMON_MIGRATE_AUDIT_ACTION,
          },
        }),
        30,
      );
    } finally {
      await wipeCreatedUsers();
    }
  });

  test("injected mid-run failure keeps unmoved machines on racks and loses none", async () => {
    try {
      const { userA, userB, userC } = await seedProductionShapedFixture();
      const result = await migration.runShowcase3dCommonRoomMigration({
        execute: true,
        failAfter: 10,
      });
      assert.equal(result.moved, 10);
      assert.equal(result.failures.length, 1);
      assert.equal(result.remaining, 20);
      assert.equal(result.moved + result.remaining, 30);
      assert.equal(
        await prisma.userInventory.count({ where: { userId: { in: [userA, userB, userC] } } }),
        10,
      );
      assert.equal((await migration.listShowcase3dInCommonRooms()).length, 20);

      const resume = await migration.runShowcase3dCommonRoomMigration({ execute: true });
      assert.equal(resume.planned, 20);
      assert.equal(resume.moved, 20);
      assert.equal(resume.remaining, 0);
      assert.equal(
        await prisma.userInventory.count({ where: { userId: { in: [userA, userB, userC] } } }),
        30,
      );
      assert.equal((await migration.listShowcase3dInCommonRooms()).length, 0);
    } finally {
      await wipeCreatedUsers();
    }
  });

  test("aborts when live count exceeds survey × 2", async () => {
    try {
      await seedProductionShapedFixture();
      const result = await migration.runShowcase3dCommonRoomMigration({
        execute: true,
        surveyCount: 10,
        abortMultiplier: 2,
      });
      assert.ok(result.aborted);
      assert.equal(result.moved, 0);
      assert.equal((await migration.listShowcase3dInCommonRooms()).length, 30);
    } finally {
      await wipeCreatedUsers();
    }
  });

  test("service helper reuses moveRackMinerBackToInventoryTx path (install-shaped round trip)", async () => {
    try {
      const userId = await makeUser("round");
      await prisma.$transaction(async (tx) => {
        await roomsService.provisionFirstRoomTx(tx, userId);
      });
      await plantInRoom(userId, 1, 1);
      const hit = (await migration.listShowcase3dInCommonRooms()).find((row) => row.userId === userId);
      assert.ok(hit);
      const moved = await roomsService.migrateShowcase3dCommonRackToInventory({
        userId,
        rackId: hit.rackId,
      });
      assert.equal(moved.skipped, undefined);
      assert.ok(moved.minerName);
      const inv = await prisma.userInventory.findMany({ where: { userId } });
      assert.equal(inv.length, 1);
      assert.equal(Number(inv[0].hashRate), HASH_RATE);
      const rack = await prisma.userRack.findUnique({ where: { id: hit.rackId } });
      assert.equal(rack.userMinerId, null);
    } finally {
      await wipeCreatedUsers();
    }
  });
});
