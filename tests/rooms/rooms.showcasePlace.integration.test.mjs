/**
 * Install and remove the 3D rack. Local database only. Never user 294.
 * The credit is an unplaced rack in room 101, not users.rack_credits.
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

const dbUrl = process.env.DATABASE_URL ?? "";
const PRODUCTION_MARKERS = ["blockminer.space", "89.167.119.164", "169.58.45.155", "blockminer-db"];
const unsafe = PRODUCTION_MARKERS.some((marker) => dbUrl.includes(marker));
const hasDb = Boolean(dbUrl) && !unsafe;

describe("showcase rack place and remove", { skip: !hasDb && "local DATABASE_URL required" }, () => {
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
    const tag = `showcase-place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        name: tag,
        email: `${tag}@blockminer.test`,
        passwordHash: "x",
        polBalance: 0,
        blkBalance: "10",
        rackCredits: 4,
      },
      select: { id: true },
    });
    assert.notEqual(user.id, 294);
    createdUserIds.push(user.id);
    return user.id;
  }

  async function floors(userId) {
    const rows = await prisma.userVisualRackPlacement.findMany({
      where: { userId, room: { roomNumber: 101 } },
      select: { visualIndex: true, floorSlot: true },
      orderBy: { visualIndex: "asc" },
    });
    return rows;
  }

  test("the free room grants no rack, and the flag ignores the allowlist", async () => {
    const outsider = await makeUser();
    process.env.SHOWCASE_3D_ROOM_USER_IDS = "1";
    const listed = await roomsService.listRoomsForUser(outsider);
    const room = listed.rooms.find((row) => row.roomNumber === 101);
    assert.equal(room.unlocked, true);
    assert.equal(room.racks.length, 0);
    const credits = await prisma.user.findUnique({ where: { id: outsider }, select: { rackCredits: true } });
    assert.equal(credits.rackCredits, 4);
  });

  test("buying stores a credit, installing spends it, and a second install does not create a rack", async () => {
    const userId = await makeUser();
    const bought = await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop");
    assert.equal(bought.ok, true);
    assert.equal(bought.rackCredits, 4);
    assert.deepEqual(await floors(userId), [{ visualIndex: 0, floorSlot: null }]);

    const placed = await placements.setVisualPlacementForUser(userId, 101, 0, 3, false);
    assert.equal(placed.ok, true);
    assert.equal(placed.rackCredits, 4);
    assert.deepEqual(await floors(userId), [{ visualIndex: 0, floorSlot: 3 }]);
    assert.equal(await prisma.userRack.count({ where: { userId, room: { roomNumber: 101 } } }), 2);

    const again = await placements.setVisualPlacementForUser(userId, 101, 0, 3, false);
    assert.equal(again.ok, true);
    assert.equal(await prisma.userRack.count({ where: { userId, room: { roomNumber: 101 } } }), 2);

    await assert.rejects(
      () => placements.setVisualPlacementForUser(userId, 101, 0, 4, false),
      (err) => err.code === "SHOWCASE_RACK_FIXED",
    );
  });

  test("two installs of the same credit leave one rack on one pad", async () => {
    const userId = await makeUser();
    await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop");
    const [first, second] = await Promise.allSettled([
      placements.setVisualPlacementForUser(userId, 101, 0, 1, false),
      placements.setVisualPlacementForUser(userId, 101, 0, 2, false),
    ]);
    const oks = [first, second].filter((row) => row.status === "fulfilled");
    assert.equal(oks.length >= 1, true);
    const rows = await floors(userId);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].floorSlot === 1 || rows[0].floorSlot === 2);
    assert.equal(await prisma.userRack.count({ where: { userId, room: { roomNumber: 101 } } }), 2);
  });

  test("a machine on the rack blocks removal and then returns to inventory", async () => {
    const userId = await makeUser();
    await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop");
    await placements.setVisualPlacementForUser(userId, 101, 0, 0, false);
    const rack = await prisma.userRack.findFirst({
      where: { userId, room: { roomNumber: 101 }, position: 0 },
    });
    const inventory = await prisma.userInventory.create({
      data: {
        userId,
        minerName: "MinerCore MCX9",
        level: 1,
        hashRate: 50,
        slotSize: 1,
        imageUrl: "/media/offers/minercore-mcx9.webp",
      },
    });
    const installed = await roomsService.installMinerForUser(userId, rack.id, inventory.id);
    assert.equal(installed.inventoryItem.minerName, "MinerCore MCX9");

    await assert.rejects(
      () => placements.setVisualPlacementForUser(userId, 101, 0, null, false),
      (err) => err.code === "RACK_NOT_EMPTY",
    );
    const stillThere = await prisma.userMiner.count({ where: { userId } });
    assert.equal(stillThere, 1);

    await roomsService.uninstallMinerForUser(userId, rack.id);
    const back = await prisma.userInventory.findMany({ where: { userId } });
    assert.equal(back.length, 1);
    assert.equal(Number(back[0].hashRate), 50);
    assert.equal(await prisma.userMiner.count({ where: { userId } }), 0);

    const removed = await placements.setVisualPlacementForUser(userId, 101, 0, null, false);
    assert.equal(removed.ok, true);
    assert.deepEqual(await floors(userId), [{ visualIndex: 0, floorSlot: null }]);
    assert.equal(await prisma.userRack.count({ where: { userId, room: { roomNumber: 101 } } }), 2);
    const again = await placements.setVisualPlacementForUser(userId, 101, 0, null, false);
    assert.equal(again.ok, true);
    assert.equal((await floors(userId)).length, 1);

    const reinstalled = await placements.setVisualPlacementForUser(userId, 101, 0, 5, false);
    assert.equal(reinstalled.ok, true);
    assert.deepEqual(await floors(userId), [{ visualIndex: 0, floorSlot: 5 }]);
    const shelf = await prisma.user.findUnique({ where: { id: userId }, select: { rackCredits: true } });
    assert.equal(shelf.rackCredits, 4);
  });
});
