import {
  RACK_CURRENCY,
  isRackPurchaseLiveAt,
  readRackImageUrl,
  readRackOfferListPrice,
  readRackOfferPrice,
  readRackSalesAvailableAt,
  readRackShopPrice,
} from "./racks.config.js";

/** Single sellable SKU — one visual rack (8 mining slots) in inventory2. */
export const RACK_SKU_SHELF = "mining_rack_shelf" as const;

export type RackSku = typeof RACK_SKU_SHELF;

export type RackCatalogItemPublic = {
  sku: RackSku;
  nameKey: string;
  descriptionKey: string;
  price: number;
  listPrice: number;
  currency: typeof RACK_CURRENCY;
  imageUrl: string;
  creditsPerUnit: number;
  salesAvailableAt: string;
  isPurchaseLive: boolean;
};

const CATALOG: Array<{
  sku: RackSku;
  nameKey: string;
  descriptionKey: string;
  creditsPerUnit: number;
}> = [
  {
    sku: RACK_SKU_SHELF,
    nameKey: "racks.mining_rack_name",
    descriptionKey: "racks.mining_rack_desc",
    creditsPerUnit: 1,
  },
];

export function isRackSku(value: string): value is RackSku {
  return value === RACK_SKU_SHELF;
}

export function normalizeRackSku(value: string): RackSku | null {
  return isRackSku(value) ? RACK_SKU_SHELF : null;
}

export function readRackCatalogItem(sku: RackSku): (typeof CATALOG)[number] | null {
  return CATALOG.find((row) => row.sku === sku) ?? null;
}

function serializeItem(
  row: (typeof CATALOG)[number],
  channel: "shop" | "offer",
  now: Date,
): RackCatalogItemPublic {
  const salesAvailableAt = readRackSalesAvailableAt();
  const shopPrice = readRackShopPrice();
  const offerPrice = readRackOfferPrice();
  const listPrice = channel === "offer" ? readRackOfferListPrice() : shopPrice;
  const price = channel === "offer" ? offerPrice : shopPrice;
  return {
    sku: row.sku,
    nameKey: row.nameKey,
    descriptionKey: row.descriptionKey,
    price,
    listPrice,
    currency: RACK_CURRENCY,
    imageUrl: readRackImageUrl(),
    creditsPerUnit: row.creditsPerUnit,
    salesAvailableAt: salesAvailableAt.toISOString(),
    isPurchaseLive: isRackPurchaseLiveAt(now),
  };
}

export function listRackCatalogForShop(now: Date = new Date()): RackCatalogItemPublic[] {
  return CATALOG.map((row) => serializeItem(row, "shop", now));
}

export function listRackCatalogForOffer(now: Date = new Date()): RackCatalogItemPublic[] {
  return CATALOG.map((row) => serializeItem(row, "offer", now));
}
