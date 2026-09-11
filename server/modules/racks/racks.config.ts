/**
 * Mining rack shelf catalog — visible before sales unlock; purchase gated by salesAvailableAt.
 */
export const RACK_CURRENCY = "BLK" as const;

export const RACK_SALES_AVAILABLE_AT_ENV_KEY = "RACK_SALES_AVAILABLE_AT";
/** Product default: shop + offers rack purchase live (override with env). */
export const DEFAULT_RACK_SALES_AVAILABLE_AT = "2026-09-10T00:00:00.000Z";

export const RACK_SHOP_PRICE_ENV_KEY = "RACK_SHOP_PRICE";
export const DEFAULT_RACK_SHOP_PRICE = 0.15;

export const RACK_OFFER_PRICE_ENV_KEY = "RACK_OFFER_PRICE";
export const DEFAULT_RACK_OFFER_PRICE = 0.1;

export const RACK_OFFER_LIST_PRICE_ENV_KEY = "RACK_OFFER_LIST_PRICE";
export const DEFAULT_RACK_OFFER_LIST_PRICE = 0.15;

export const RACK_OFFER_TITLE_ENV_KEY = "RACK_OFFER_TITLE";
export const DEFAULT_RACK_OFFER_TITLE = "Racks em promoção";

export const RACK_OFFER_DESCRIPTION_ENV_KEY = "RACK_OFFER_DESCRIPTION";
export const DEFAULT_RACK_OFFER_DESCRIPTION =
  "Prateleiras para racks — instale no inventário e coloque suas máquinas.";

export const RACK_OFFER_ENDS_AT_ENV_KEY = "RACK_OFFER_ENDS_AT";
export const DEFAULT_RACK_OFFER_ENDS_AT = "2099-12-31T23:59:59.999Z";

export const RACK_IMAGE_URL_ENV_KEY = "RACK_IMAGE_URL";
export const DEFAULT_RACK_IMAGE_URL = "/media/racks/default-shelf.svg";

export const RACK_MAX_BULK_QUANTITY_ENV_KEY = "RACK_MAX_BULK_QUANTITY";
export const DEFAULT_RACK_MAX_BULK_QUANTITY = 25;

function readPositiveNumber(raw: string | undefined | null, fallback: number): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = parseFloat(String(raw).trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readPositiveInt(raw: string | undefined | null, fallback: number): number {
  const n = readPositiveNumber(raw, fallback);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function readRackSalesAvailableAt(
  raw: string | undefined | null = process.env[RACK_SALES_AVAILABLE_AT_ENV_KEY],
): Date {
  const iso = raw == null || String(raw).trim() === "" ? DEFAULT_RACK_SALES_AVAILABLE_AT : String(raw).trim();
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return new Date(DEFAULT_RACK_SALES_AVAILABLE_AT);
  }
  return d;
}

export function readRackShopPrice(
  raw: string | undefined | null = process.env[RACK_SHOP_PRICE_ENV_KEY],
): number {
  return readPositiveNumber(raw, DEFAULT_RACK_SHOP_PRICE);
}

export function readRackOfferPrice(
  raw: string | undefined | null = process.env[RACK_OFFER_PRICE_ENV_KEY],
): number {
  return readPositiveNumber(raw, DEFAULT_RACK_OFFER_PRICE);
}

export function readRackOfferListPrice(
  raw: string | undefined | null = process.env[RACK_OFFER_LIST_PRICE_ENV_KEY],
): number {
  return readPositiveNumber(raw, DEFAULT_RACK_OFFER_LIST_PRICE);
}

export function readRackOfferTitle(
  raw: string | undefined | null = process.env[RACK_OFFER_TITLE_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_RACK_OFFER_TITLE;
  return String(raw).trim();
}

export function readRackOfferDescription(
  raw: string | undefined | null = process.env[RACK_OFFER_DESCRIPTION_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_RACK_OFFER_DESCRIPTION;
  return String(raw).trim();
}

export function readRackOfferEndsAt(
  raw: string | undefined | null = process.env[RACK_OFFER_ENDS_AT_ENV_KEY],
): Date {
  const iso = raw == null || String(raw).trim() === "" ? DEFAULT_RACK_OFFER_ENDS_AT : String(raw).trim();
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return new Date(DEFAULT_RACK_OFFER_ENDS_AT);
  return d;
}

export function readRackImageUrl(
  raw: string | undefined | null = process.env[RACK_IMAGE_URL_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_RACK_IMAGE_URL;
  return String(raw).trim();
}

export function readRackMaxBulkQuantity(
  raw: string | undefined | null = process.env[RACK_MAX_BULK_QUANTITY_ENV_KEY],
): number {
  return readPositiveInt(raw, DEFAULT_RACK_MAX_BULK_QUANTITY);
}

export function isRackPurchaseLiveAt(now: Date): boolean {
  return now.getTime() >= readRackSalesAvailableAt().getTime();
}
