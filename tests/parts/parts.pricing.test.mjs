import test from "node:test";
import assert from "node:assert/strict";
import {
  PART_SHOP_PRICES,
  PART_OFFER_PRICES,
  PART_OFFER_PACKS,
  listPartsCatalogForShop,
  listPartsCatalogForOffer,
  buildActivePartOffersPayload,
} from "../../server/modules/parts/parts.pricing.ts";

test("parts.pricing: prices adhere to rarity hierarchy", () => {
  assert.equal(PART_SHOP_PRICES.common, 0.002);
  assert.equal(PART_SHOP_PRICES.uncommon, 0.01);
  assert.equal(PART_SHOP_PRICES.rare, 0.05);
  assert.equal(PART_SHOP_PRICES.epic, 0.22);
  assert.equal(PART_SHOP_PRICES.legendary, 1.0);

  // Offer prices are discounted relative to shop
  assert.equal(PART_OFFER_PRICES.common, 0.0015);
  assert.equal(PART_OFFER_PRICES.uncommon, 0.0075);
  assert.equal(PART_OFFER_PRICES.rare, 0.038);
  assert.equal(PART_OFFER_PRICES.epic, 0.17);
  assert.equal(PART_OFFER_PRICES.legendary, 0.75);

  assert.ok(PART_OFFER_PRICES.common < PART_SHOP_PRICES.common);
  assert.ok(PART_OFFER_PRICES.uncommon < PART_SHOP_PRICES.uncommon);
  assert.ok(PART_OFFER_PRICES.rare < PART_SHOP_PRICES.rare);
  assert.ok(PART_OFFER_PRICES.epic < PART_SHOP_PRICES.epic);
  assert.ok(PART_OFFER_PRICES.legendary < PART_SHOP_PRICES.legendary);
});

test("parts.pricing: shop catalog lists all 30 part combinations", () => {
  const shopCatalog = listPartsCatalogForShop();
  assert.equal(shopCatalog.length, 30);
  for (const item of shopCatalog) {
    assert.ok(item.slug);
    assert.ok(item.rarity);
    assert.ok(item.price > 0);
    assert.equal(item.currency, "BLK");
    assert.ok(item.imageUrl.includes(item.slug));
  }
});

test("parts.pricing: offer catalog lists all 30 discounted items", () => {
  const offerCatalog = listPartsCatalogForOffer();
  assert.equal(offerCatalog.length, 30);
  for (const item of offerCatalog) {
    assert.ok(item.price < item.listPrice);
  }
});

test("parts.pricing: offer packs contain valid items and discounts", () => {
  assert.equal(PART_OFFER_PACKS.length, 2);

  const starter = PART_OFFER_PACKS.find((p) => p.id === "starter_pack");
  assert.ok(starter);
  assert.equal(starter.price, 0.04);
  const starterTotalQty = starter.items.reduce((acc, it) => acc + it.quantity, 0);
  assert.equal(starterTotalQty, 30);

  const advanced = PART_OFFER_PACKS.find((p) => p.id === "advanced_pack");
  assert.ok(advanced);
  assert.equal(advanced.price, 0.1);
  const advTotalQty = advanced.items.reduce((acc, it) => acc + it.quantity, 0);
  assert.equal(advTotalQty, 15);
});

test("parts.pricing: active payload structure", () => {
  const payload = buildActivePartOffersPayload();
  assert.equal(payload.isLive, true);
  assert.equal(payload.currency, "BLK");
  assert.equal(payload.items.length, 30);
  assert.equal(payload.packs.length, 2);
});
