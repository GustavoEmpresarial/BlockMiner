import test from "node:test";
import assert from "node:assert/strict";

const showcase = await import("../../server/modules/rooms/rooms.showcase.ts");
const { RACK_ERROR_MESSAGE } = await import("../../server/modules/racks/racks.errors.ts");
const racksService = await import("../../server/modules/racks/racks.service.ts");
const shopService = await import("../../server/modules/shop/shop.service.ts");

test("showcase rack prices are BLK strings, shop 1.5 and offer 0.95", () => {
  assert.equal(showcase.SHOWCASE_RACK_SHOP_PRICE_BLK, "1.5");
  assert.equal(showcase.SHOWCASE_RACK_OFFER_PRICE_BLK, "0.95");
  assert.equal(showcase.SHOWCASE_RACK_OFFER_LIST_PRICE_BLK, "1.5");
  assert.equal(showcase.showcaseRackPriceBlk("shop"), "1.5");
  assert.equal(showcase.showcaseRackPriceBlk("offer"), "0.95");
  assert.equal(showcase.SHOWCASE_RACK_SHOP_SKU, "showcase_3d_rack");
  assert.equal(showcase.isShowcaseRackShopSku("showcase_3d_rack"), true);
  assert.equal(showcase.isShowcaseRackShopSku("mining_rack_shelf"), false);
});

test("showcase listing uses the room allowlist and grants zero credits", () => {
  const prevEnabled = process.env.SHOWCASE_3D_ROOM_ENABLED;
  const prevIds = process.env.SHOWCASE_3D_ROOM_USER_IDS;
  process.env.SHOWCASE_3D_ROOM_ENABLED = "0";
  process.env.SHOWCASE_3D_ROOM_USER_IDS = "4242";
  try {
    assert.equal(showcase.isShowcaseRoomEnabledForUser(4242), true);
    assert.equal(showcase.isShowcaseRoomEnabledForUser(7), false);
    assert.equal(showcase.showcaseRackListingForUser(7, "shop"), null);
    assert.equal(showcase.showcaseRackListingForUser(7, "offer"), null);
    const shopItem = showcase.showcaseRackListingForUser(4242, "shop");
    const offerItem = showcase.showcaseRackListingForUser(4242, "offer");
    assert.equal(shopItem.priceBlk, "1.5");
    assert.equal(shopItem.creditsPerUnit, 0);
    assert.equal(shopItem.maxQuantity, showcase.SHOWCASE_RACKS_PER_ROOM);
    assert.equal(offerItem.priceBlk, "0.95");
    assert.equal(offerItem.listPriceBlk, "1.5");
    assert.equal(offerItem.currency, "BLK");
  } finally {
    if (prevEnabled === undefined) delete process.env.SHOWCASE_3D_ROOM_ENABLED;
    else process.env.SHOWCASE_3D_ROOM_ENABLED = prevEnabled;
    if (prevIds === undefined) delete process.env.SHOWCASE_3D_ROOM_USER_IDS;
    else process.env.SHOWCASE_3D_ROOM_USER_IDS = prevIds;
  }
});

test("credit rack purchase rejects the showcase sku before granting credits", async () => {
  await assert.rejects(
    () => racksService.purchaseRacksForUser(1, showcase.SHOWCASE_RACK_SHOP_SKU, 1, "shop", new Date()),
    (err) => err instanceof Error && err.message === RACK_ERROR_MESSAGE.INVALID_SKU,
  );
});

test("shop catalog never includes the showcase rack now that it is discontinued", async () => {
  const orig = shopService.shopRepoRef.listActiveMiners;
  shopService.shopRepoRef.listActiveMiners = async () => ({ total: 0, miners: [] });
  try {
    const res1 = await shopService.listMinersForShop(1, 10, 7);
    const res2 = await shopService.listMinersForShop(1, 10, 4242);
    const anon = await shopService.listMinersForShop(1, 10);
    assert.equal(res1.racks.some((row) => row.sku === showcase.SHOWCASE_RACK_SHOP_SKU), false);
    assert.equal(res2.racks.some((row) => row.sku === showcase.SHOWCASE_RACK_SHOP_SKU), false);
    assert.equal(anon.racks.some((row) => row.sku === showcase.SHOWCASE_RACK_SHOP_SKU), false);
  } finally {
    shopService.shopRepoRef.listActiveMiners = orig;
  }
});
