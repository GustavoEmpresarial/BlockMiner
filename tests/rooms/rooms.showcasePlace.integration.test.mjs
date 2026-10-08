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

  test("room 101 is not listed and cannot have placements set", async () => {
    const user = await makeUser();
    const listed = await roomsService.listRoomsForUser(user);
    assert.equal(listed.rooms.some((r) => r.roomNumber === 101), false);
    await assert.rejects(
      () => placements.setVisualPlacementForUser(user, 101, 0, 0, false),
      (err) => err.http === 404 || err.message === "Sala não encontrada.",
    );
  });
});
