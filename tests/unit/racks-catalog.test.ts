import { describe, expect, it } from "vitest";
import {
  isRackPurchaseLiveAt,
  readRackOfferPrice,
  readRackShopPrice,
} from "../../server/modules/racks/racks.config.js";
import { listRackCatalogForOffer, listRackCatalogForShop } from "../../server/modules/racks/racks.catalog.js";
import { buildActiveRackOffersPayload } from "../../server/modules/racks/racks.offers.js";

describe("racks catalog", () => {
  it("uses shop and offer prices from config defaults", () => {
    const before = new Date("2026-09-01T12:00:00.000Z");
    const shop = listRackCatalogForShop(before);
    const offer = listRackCatalogForOffer(before);
    expect(shop).toHaveLength(1);
    expect(offer).toHaveLength(1);
    expect(shop[0]?.sku).toBe("mining_rack_shelf");
    expect(shop[0]?.price).toBe(readRackShopPrice());
    expect(offer[0]?.price).toBe(readRackOfferPrice());
    expect(shop[0]?.price).toBe(0.15);
    expect(offer[0]?.price).toBe(0.1);
  });

  it("blocks purchase before sales unlock but still lists catalog", () => {
    const before = new Date("2026-09-14T23:59:59.999Z");
    expect(isRackPurchaseLiveAt(before)).toBe(false);
    expect(listRackCatalogForShop(before)[0]?.isPurchaseLive).toBe(false);
    const payload = buildActiveRackOffersPayload(before);
    expect(payload?.isPurchaseLive).toBe(false);
    expect(payload?.items.length).toBeGreaterThan(0);
  });

  it("allows purchase on and after unlock date", () => {
    const on = new Date("2026-09-15T00:00:00.000Z");
    expect(isRackPurchaseLiveAt(on)).toBe(true);
    expect(listRackCatalogForShop(on)[0]?.isPurchaseLive).toBe(true);
  });
});
