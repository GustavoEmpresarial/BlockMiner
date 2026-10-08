/**
 * 3D miner must install only in the showcase room. Local DB only. Never user 294.
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

const dbUrl = process.env.DATABASE_URL ?? "";
const PRODUCTION_MARKERS = ["blockminer.space", "89.167.119.164", "169.58.45.155", "blockminer-db", "161.97.176.125"];
const unsafe = PRODUCTION_MARKERS.some((marker) => dbUrl.includes(marker));
const hasDb = Boolean(dbUrl) && !unsafe;

describe("showcase 3D miner blocked from common rooms", { skip: !hasDb && "local DATABASE_URL required" }, () => {
  let prisma;
  let roomsService;
  let placements;
  const createdUserIds = [];
  const prevEnabled = process.env.SHOWCASE_3D_ROOM_ENABLED;
  const prevIds = process.env.SHOWCASE_3D_ROOM_USER_IDS;

  before(async () => {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    roomsService = await import("../../server/modules/rooms/rooms.service.ts");
    placements = await import("../../server/modules/rooms/rooms.visualPlacements.ts");
    process.env.SHOWCASE_3D_ROOM_ENABLED = "1";
    process.env.SHOWCASE_3D_ROOM_USER_IDS = "";
  });

  after(async () => {
    for (const userId of createdUserIds) {
      await prisma.userVisualRackPlacement.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRack.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userInventory.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userMiner.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRoom.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    if (prevEnabled === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = prevEnabled;
    if (prevIds === undefined) delete process.env.SHOWCASE_3D_ROOM_USER_IDS;
    else process.env.SHOWCASE_3D_ROOM_USER_IDS = prevIds;
    await prisma.$disconnect();
  });

  async function makeUser() {
    const tag = `showcase-common-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        name: tag,
        email: `${tag}@blockminer.test`,
        passwordHash: "x",
        polBalance: 0,
        blkBalance: "20",
        rackCredits: 0,
      },
      select: { id: true },
    });
    assert.notEqual(user.id, 294);
    createdUserIds.push(user.id);
    await prisma.$transaction(async (tx) => {
      await roomsService.provisionFirstRoomTx(tx, user.id);
    });
    return user.id;
  }

  async function makeMcx9Inventory(userId) {
    const item = await prisma.userInventory.create({
      data: {
        userId,
        minerName: "MinerCore MCX9",
        level: 1,
        hashRate: 250,
        slotSize: 1,
        imageUrl: "/media/offers/minercore-mcx9.webp",
      },
    });
    return item.id;
  }

  test("accepts MinerCore MCX9 in room 1 standard slot", async () => {
    const userId = await makeUser();
    const inventoryId = await makeMcx9Inventory(userId);
    const rack = await prisma.userRack.findFirst({
      where: { userId, userMinerId: null, room: { roomNumber: 1 } },
      orderBy: { position: "asc" },
    });
    assert.ok(rack);

    const result = await roomsService.installMinerForUser(userId, rack.id, inventoryId);
    assert.equal("inventoryItem" in result, true);
    if ("inventoryItem" in result) {
      assert.equal(result.inventoryItem.minerName, "MinerCore MCX9");
    }

    const occupied = await prisma.userRack.findUnique({ where: { id: rack.id } });
    assert.ok(occupied.userMinerId);
  });
});
