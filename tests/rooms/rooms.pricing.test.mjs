import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_ROOM_OFFER_PRICES_CSV,
  DEFAULT_ROOM_PRICES_CSV,
  getRoomPriceQuote,
  readRoomListPrices,
  readRoomOfferImageUrl,
  readRoomOfferPrices,
} = await import("../../server/modules/rooms/rooms.config.ts");
const { buildActiveRoomOffersPayload } = await import(
  "../../server/modules/rooms/rooms.offers.ts"
);

test("default list prices: room 2/3/4 are 10 / 50 / 75 BLK", () => {
  assert.equal(DEFAULT_ROOM_PRICES_CSV, "0,10,50,75");
  const list = readRoomListPrices(DEFAULT_ROOM_PRICES_CSV);
  assert.deepEqual(list, [0, 10, 50, 75]);
});

test("default offer prices: paid rooms at 50% off", () => {
  assert.equal(DEFAULT_ROOM_OFFER_PRICES_CSV, "0,5,25,37.5");
  const offer = readRoomOfferPrices(DEFAULT_ROOM_OFFER_PRICES_CSV);
  assert.deepEqual(offer, [0, 5, 25, 37.5]);
});

test("getRoomPriceQuote applies promo when offer is active", () => {
  const prevActive = process.env.ROOM_OFFER_ACTIVE;
  process.env.ROOM_OFFER_ACTIVE = "1";
  try {
    const room2 = getRoomPriceQuote(2);
    assert.equal(room2.listPrice, 10);
    assert.equal(room2.price, 5);
    assert.equal(room2.onOffer, true);

    const room3 = getRoomPriceQuote(3);
    assert.equal(room3.listPrice, 50);
    assert.equal(room3.price, 25);
    assert.equal(room3.onOffer, true);

    const room4 = getRoomPriceQuote(4);
    assert.equal(room4.listPrice, 75);
    assert.equal(room4.price, 37.5);
    assert.equal(room4.onOffer, true);
  } finally {
    if (prevActive === undefined) delete process.env.ROOM_OFFER_ACTIVE;
    else process.env.ROOM_OFFER_ACTIVE = prevActive;
  }
});

test("each paid room has its own offer card art", () => {
  assert.equal(readRoomOfferImageUrl(2), "/media/sala/room-2.webp");
  assert.equal(readRoomOfferImageUrl(3), "/media/sala/room-3.webp");
  assert.equal(readRoomOfferImageUrl(4), "/media/sala/room-4.webp");
});

test("buildActiveRoomOffersPayload lists rooms 2-4 at 50% off", () => {
  const prevActive = process.env.ROOM_OFFER_ACTIVE;
  process.env.ROOM_OFFER_ACTIVE = "1";
  try {
    const payload = buildActiveRoomOffersPayload(new Date());
    assert.ok(payload);
    assert.equal(payload.rooms.length, 3);
    assert.deepEqual(
      payload.rooms.map((r) => [r.roomNumber, r.price, r.listPrice, r.discountPercent, r.imageUrl]),
      [
        [2, 5, 10, 50, "/media/sala/room-2.webp"],
        [3, 25, 50, 50, "/media/sala/room-3.webp"],
        [4, 37.5, 75, 50, "/media/sala/room-4.webp"],
      ],
    );
  } finally {
    if (prevActive === undefined) delete process.env.ROOM_OFFER_ACTIVE;
    else process.env.ROOM_OFFER_ACTIVE = prevActive;
  }
});

test("buildActiveRoomOffersPayload only advertises the next sequential room for a user", () => {
  const prevActive = process.env.ROOM_OFFER_ACTIVE;
  process.env.ROOM_OFFER_ACTIVE = "1";
  try {
    const onlyRoom3 = buildActiveRoomOffersPayload(new Date(), { unlockedRoomCount: 2 });
    assert.ok(onlyRoom3);
    assert.deepEqual(
      onlyRoom3.rooms.map((r) => r.roomNumber),
      [3],
    );

    const allUnlocked = buildActiveRoomOffersPayload(new Date(), { unlockedRoomCount: 4 });
    assert.equal(allUnlocked, null);
  } finally {
    if (prevActive === undefined) delete process.env.ROOM_OFFER_ACTIVE;
    else process.env.ROOM_OFFER_ACTIVE = prevActive;
  }
});

test("offer disabled when ROOM_OFFER_ACTIVE=0", () => {
  const prevActive = process.env.ROOM_OFFER_ACTIVE;
  process.env.ROOM_OFFER_ACTIVE = "0";
  try {
    const quote = getRoomPriceQuote(2);
    assert.equal(quote.price, 10);
    assert.equal(quote.onOffer, false);
    assert.equal(getRoomPriceQuote(3).price, 50);
    assert.equal(getRoomPriceQuote(4).price, 75);
    assert.equal(buildActiveRoomOffersPayload(new Date()), null);
  } finally {
    if (prevActive === undefined) delete process.env.ROOM_OFFER_ACTIVE;
    else process.env.ROOM_OFFER_ACTIVE = prevActive;
  }
});
