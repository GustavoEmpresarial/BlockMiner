/**
 * Money path for the 3D rack sold in the shop and in offers.
 * Local database only. Refuses known production markers. Never uses user 294.
 */
import "dotenv/config";
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const dbUrl = process.env.DATABASE_URL ?? "";
const PRODUCTION_MARKERS = ["blockminer.space", "89.167.119.164", "169.58.45.155", "blockminer-db"];
const unsafe = PRODUCTION_MARKERS.some((marker) => dbUrl.includes(marker));
const hasDb = Boolean(dbUrl) && !unsafe;

describe("showcase rack shop and offer purchase", { skip: !hasDb && "local DATABASE_URL required" }, () => {
  let prisma;
  let roomsService;
  let offerService;
  const createdUserIds = [];
  const prevEnabled = process.env.SHOWCASE_3D_ROOM_ENABLED;
  const prevIds = process.env.SHOWCASE_3D_ROOM_USER_IDS;
  const prevPrice = process.env.SHOWCASE_RACK_PRICE;

  before(async () => {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    roomsService = await import("../../server/modules/rooms/rooms.service.ts");
    offerService = await import("../../server/modules/offer-events/offer-events.service.ts");
    process.env.SHOWCASE_3D_ROOM_ENABLED = "0";
    delete process.env.SHOWCASE_RACK_PRICE;
  });

  after(async () => {
    for (const userId of createdUserIds) {
      await prisma.userVisualRackPlacement.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRack.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRoom.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    if (prevEnabled === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = prevEnabled;
    if (prevIds === undefined) delete process.env.SHOWCASE_3D_ROOM_USER_IDS;
    else process.env.SHOWCASE_3D_ROOM_USER_IDS = prevIds;
    if (prevPrice === undefined) delete process.env.SHOWCASE_RACK_PRICE;
    else process.env.SHOWCASE_RACK_PRICE = prevPrice;
    await prisma.$disconnect();
  });

  async function makeUser(balance) {
    const tag = `showcase-rack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        name: tag,
        email: `${tag}@blockminer.test`,
        passwordHash: "x",
        polBalance: 0,
        blkBalance: balance,
        rackCredits: 4,
      },
      select: { id: true },
    });
    assert.notEqual(user.id, 294);
    createdUserIds.push(user.id);
    return user.id;
  }

  function allow(userId) {
    process.env.SHOWCASE_3D_ROOM_ENABLED = "0";
    process.env.SHOWCASE_3D_ROOM_USER_IDS = String(userId);
  }

  async function balanceOf(userId) {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true, rackCredits: true },
    });
    return row;
  }

  async function rackState(userId) {
    const room = await prisma.userRoom.findFirst({
      where: { userId, roomNumber: 101 },
      select: { id: true },
    });
    if (!room) return { rows: 0, placements: 0, stored: 0 };
    const rows = await prisma.userRack.count({ where: { roomId: room.id } });
    const placementRows = await prisma.userVisualRackPlacement.findMany({
      where: { roomId: room.id },
      select: { floorSlot: true },
    });
    return {
      rows,
      placements: placementRows.length,
      stored: placementRows.filter((row) => row.floorSlot == null).length,
    };
  }

  test("showcase rack purchases are completely disabled and do not debit balance", async () => {
    const user = await makeUser("10");
    const shop = await roomsService.purchaseShowcaseRacksForChannel(user, 1, "shop");
    const offer = await roomsService.purchaseShowcaseRacksForChannel(user, 1, "offer");
    const room = await roomsService.buyShowcaseRackForUser(user, null);

    assert.equal(shop.ok, false);
    assert.equal(shop.status, 403);
    assert.equal(shop.code, "SHOWCASE_ROOM_DISABLED");

    assert.equal(offer.ok, false);
    assert.equal(offer.status, 403);
    assert.equal(offer.code, "SHOWCASE_ROOM_DISABLED");

    assert.equal(room.ok, false);
    assert.equal(room.status, 403);
    assert.equal(room.code, "SHOWCASE_ROOM_DISABLED");

    const row = await balanceOf(user);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("10")));
    assert.equal(row.rackCredits, 4);
    assert.deepEqual(await rackState(user), { rows: 0, placements: 0, stored: 0 });
  });
});
