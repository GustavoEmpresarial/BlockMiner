import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FAN_MAX_BULK_QUANTITY,
  FANS_FEATURE_ENABLED_ENV_KEY,
  isFanPurchaseLiveAt,
  readFanOfferPrice,
  readFanShopPrice,
} from "../../server/modules/fans/fans.config.js";
import { listFanCatalogForOffer, listFanCatalogForShop } from "../../server/modules/fans/fans.catalog.js";
import { buildActiveFanOffersPayload } from "../../server/modules/fans/fans.offers.js";

afterEach(() => {
  delete process.env[FANS_FEATURE_ENABLED_ENV_KEY];
});

describe("fans catalog", () => {
  it("returns empty catalog when fans feature is explicitly disabled", () => {
    process.env[FANS_FEATURE_ENABLED_ENV_KEY] = "0";
    expect(listFanCatalogForShop(new Date("2026-09-20T00:00:00.000Z"))).toEqual([]);
    expect(listFanCatalogForOffer(new Date("2026-09-20T00:00:00.000Z"))).toEqual([]);
    expect(buildActiveFanOffersPayload(new Date("2026-09-20T00:00:00.000Z"))).toBeNull();
  });

  it("lists catalog by default (buyable in shop/offers)", () => {
    delete process.env[FANS_FEATURE_ENABLED_ENV_KEY];
    const before = new Date("2026-09-01T12:00:00.000Z");
    const shop = listFanCatalogForShop(before);
    const offer = listFanCatalogForOffer(before);
    expect(shop).toHaveLength(1);
    expect(offer).toHaveLength(1);
    expect(shop[0]?.sku).toBe("cooling_fan_system");
    expect(shop[0]?.price).toBe(readFanShopPrice());
    expect(offer[0]?.price).toBe(readFanOfferPrice());
    expect(shop[0]?.price).toBe(0.15);
    expect(offer[0]?.price).toBe(0.1);
  });

  it("blocks purchase before sales unlock but still lists catalog", () => {
    delete process.env[FANS_FEATURE_ENABLED_ENV_KEY];
    const before = new Date("2026-09-14T23:59:59.999Z");
    expect(isFanPurchaseLiveAt(before)).toBe(false);
    expect(listFanCatalogForShop(before)[0]?.isPurchaseLive).toBe(false);
    const payload = buildActiveFanOffersPayload(before);
    expect(payload?.isPurchaseLive).toBe(false);
    expect(payload?.items.length).toBeGreaterThan(0);
  });

  it("allows purchase on and after unlock date", () => {
    delete process.env[FANS_FEATURE_ENABLED_ENV_KEY];
    const on = new Date("2026-09-15T00:00:00.000Z");
    expect(isFanPurchaseLiveAt(on)).toBe(true);
    expect(listFanCatalogForShop(on)[0]?.isPurchaseLive).toBe(true);
    const payload = buildActiveFanOffersPayload(on);
    expect(payload?.isPurchaseLive).toBe(true);
    expect(payload?.maxBulkQuantity).toBe(DEFAULT_FAN_MAX_BULK_QUANTITY);
  });
});
