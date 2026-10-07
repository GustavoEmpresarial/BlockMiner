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
    if (!room) return { rows: 0, placements: 0 };
    const rows = await prisma.userRack.count({ where: { roomId: room.id } });
    const placements = await prisma.userVisualRackPlacement.count({ where: { roomId: room.id } });
    return { rows, placements };
  }

  test("outsider is refused and is not charged", async () => {
    const insider = await makeUser("10");
    const outsider = await makeUser("10");
    allow(insider);
    const shop = await roomsService.purchaseShowcaseRacksForChannel(outsider, 1, "shop");
    const offer = await roomsService.purchaseShowcaseRacksForChannel(outsider, 1, "offer");
    assert.equal(shop.ok, false);
    assert.equal(shop.status, 403);
    assert.equal(shop.code, "SHOWCASE_ROOM_DISABLED");
    assert.equal(offer.ok, false);
    assert.equal(offer.status, 403);
    const row = await balanceOf(outsider);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("10")));
    assert.equal(row.rackCredits, 4);
    assert.deepEqual(await rackState(outsider), { rows: 0, placements: 0 });
    const hidden = await offerService.listActiveOfferEventsForUser(outsider);
    const items = hidden.rackOffers?.items ?? [];
    assert.equal(items.some((item) => item.sku === "showcase_3d_rack"), false);
  });

  test("shop debits 1.5 BLK and installs one rack without rack credits", async () => {
    const userId = await makeUser("10");
    allow(userId);
    const result = await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop");
    assert.equal(result.ok, true);
    assert.equal(result.unitPrice, "1.50000000");
    assert.equal(result.totalPrice, "1.50000000");
    assert.equal(result.rackCredits, 4);
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("8.5")));
    assert.equal(row.rackCredits, 4);
    assert.deepEqual(await rackState(userId), { rows: 2, placements: 1 });
    const offers = await offerService.listActiveOfferEventsForUser(userId);
    const item = (offers.rackOffers?.items ?? []).find((row) => row.sku === "showcase_3d_rack");
    assert.equal(item.priceBlk, "0.95");
    assert.equal(item.listPriceBlk, "1.5");
  });

  test("offer debits 0.95 BLK on top of the shop price", async () => {
    const userId = await makeUser("8.5");
    allow(userId);
    const result = await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "offer");
    assert.equal(result.ok, true);
    assert.equal(result.totalPrice, "0.95000000");
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("7.55")));
    assert.equal(row.rackCredits, 4);
    assert.deepEqual(await rackState(userId), { rows: 2, placements: 1 });
  });

  test("in-room endpoint still debits the legacy price of 1 BLK", async () => {
    const userId = await makeUser("5");
    allow(userId);
    const result = await roomsService.buyShowcaseRackForUser(userId, null);
    assert.equal(result.ok, true);
    assert.equal(result.price, 1);
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("4")));
    assert.deepEqual(await rackState(userId), { rows: 2, placements: 1 });
  });

  test("quantity above 24 is refused without a debit", async () => {
    const userId = await makeUser("100");
    allow(userId);
    const result = await roomsService.purchaseShowcaseRacksForChannel(userId, 25, "shop");
    assert.equal(result.ok, false);
    assert.equal(result.code, "SHOWCASE_RACK_INVALID_QUANTITY");
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("100")));
    assert.deepEqual(await rackState(userId), { rows: 0, placements: 0 });
  });

  test("the 24th rack is the last one that can be bought", async () => {
    const userId = await makeUser("36");
    allow(userId);
    const filled = await roomsService.purchaseShowcaseRacksForChannel(userId, 24, "shop");
    assert.equal(filled.ok, true);
    assert.equal(filled.totalPrice, "36.00000000");
    const extra = await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "offer");
    assert.equal(extra.ok, false);
    assert.equal(extra.code, "SHOWCASE_RACK_FULL");
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("0")));
    assert.equal(row.rackCredits, 4);
    assert.deepEqual(await rackState(userId), { rows: 48, placements: 24 });
  });

  test("insufficient balance installs nothing and does not debit", async () => {
    const userId = await makeUser("1");
    allow(userId);
    const result = await roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop");
    assert.equal(result.ok, false);
    assert.equal(result.code, "INSUFFICIENT_BALANCE");
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("1")));
    assert.deepEqual(await rackState(userId), { rows: 0, placements: 0 });
  });

  test("two concurrent buys of the last affordable rack debit once", async () => {
    const userId = await makeUser("1.5");
    allow(userId);
    const [first, second] = await Promise.all([
      roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop"),
      roomsService.purchaseShowcaseRacksForChannel(userId, 1, "shop"),
    ]);
    const oks = [first, second].filter((row) => row.ok);
    assert.equal(oks.length, 1);
    const row = await balanceOf(userId);
    assert.ok(new Prisma.Decimal(row.blkBalance).equals(new Prisma.Decimal("0")));
    assert.equal(row.rackCredits, 4);
    assert.deepEqual(await rackState(userId), { rows: 2, placements: 1 });
  });
});
