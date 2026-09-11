import {
  FAN_CURRENCY,
  isFanPurchaseLiveAt,
  isFansFeatureEnabled,
  readFanImageUrl,
  readFanOfferListPrice,
  readFanOfferPrice,
  readFanSalesAvailableAt,
  readFanShopPrice,
} from "./fans.config.js";

/** Single sellable SKU — tray with fans mounted under a rack in inventory. */
export const FAN_SKU_SYSTEM = "cooling_fan_system" as const;

export type FanSku = typeof FAN_SKU_SYSTEM;

export type FanCatalogItemPublic = {
  sku: FanSku;
  nameKey: string;
  descriptionKey: string;
  price: number;
  listPrice: number;
  currency: typeof FAN_CURRENCY;
  imageUrl: string;
  creditsPerUnit: number;
  salesAvailableAt: string;
  isPurchaseLive: boolean;
};

const CATALOG: Array<{
  sku: FanSku;
  nameKey: string;
  descriptionKey: string;
  creditsPerUnit: number;
}> = [
  {
    sku: FAN_SKU_SYSTEM,
    nameKey: "fans.cooling_system_name",
    descriptionKey: "fans.cooling_system_desc",
    creditsPerUnit: 1,
  },
];

/** Legacy alias from early two-SKU catalog. */
const LEGACY_FAN_SKU = "cooling_fan" as const;

export function isFanSku(value: string): value is FanSku {
  return value === FAN_SKU_SYSTEM || value === LEGACY_FAN_SKU;
}

export function normalizeFanSku(value: string): FanSku | null {
  if (value === LEGACY_FAN_SKU) return FAN_SKU_SYSTEM;
  return isFanSku(value) ? FAN_SKU_SYSTEM : null;
}

export function readFanCatalogItem(sku: FanSku): (typeof CATALOG)[number] | null {
  return CATALOG.find((row) => row.sku === sku) ?? null;
}

function serializeItem(
  row: (typeof CATALOG)[number],
  channel: "shop" | "offer",
  now: Date,
): FanCatalogItemPublic {
  const salesAvailableAt = readFanSalesAvailableAt();
  const shopPrice = readFanShopPrice();
  const offerPrice = readFanOfferPrice();
  const listPrice = channel === "offer" ? readFanOfferListPrice() : shopPrice;
  const price = channel === "offer" ? offerPrice : shopPrice;
  return {
    sku: row.sku,
    nameKey: row.nameKey,
    descriptionKey: row.descriptionKey,
    price,
    listPrice,
    currency: FAN_CURRENCY,
    imageUrl: readFanImageUrl(),
    creditsPerUnit: row.creditsPerUnit,
    salesAvailableAt: salesAvailableAt.toISOString(),
    isPurchaseLive: isFanPurchaseLiveAt(now),
  };
}

export function listFanCatalogForShop(now: Date = new Date()): FanCatalogItemPublic[] {
  if (!isFansFeatureEnabled()) return [];
  return CATALOG.map((row) => serializeItem(row, "shop", now));
}

export function listFanCatalogForOffer(now: Date = new Date()): FanCatalogItemPublic[] {
  if (!isFansFeatureEnabled()) return [];
  return CATALOG.map((row) => serializeItem(row, "offer", now));
}
