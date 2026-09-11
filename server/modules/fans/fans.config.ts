/**
 * Cooling fan catalog — visible in shop/offers; purchase gated by salesAvailableAt.
 * Kill-switch: set FANS_FEATURE_ENABLED=0 to hide catalog and block buy/mount.
 */
export const FAN_CURRENCY = "BLK" as const;

/** When explicitly 0/false/off, fans are fully disabled. Default: enabled. */
export const FANS_FEATURE_ENABLED_ENV_KEY = "FANS_FEATURE_ENABLED";

export function isFansFeatureEnabled(
  raw: string | undefined | null = process.env[FANS_FEATURE_ENABLED_ENV_KEY],
): boolean {
  if (raw == null || String(raw).trim() === "") return true;
  const v = String(raw).trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export const FAN_SALES_AVAILABLE_AT_ENV_KEY = "FAN_SALES_AVAILABLE_AT";
/** Product default: sales open 15 Sep 2026 00:00 UTC (same as racks). */
export const DEFAULT_FAN_SALES_AVAILABLE_AT = "2026-09-15T00:00:00.000Z";

export const FAN_SHOP_PRICE_ENV_KEY = "FAN_SHOP_PRICE";
export const DEFAULT_FAN_SHOP_PRICE = 0.15;

export const FAN_OFFER_PRICE_ENV_KEY = "FAN_OFFER_PRICE";
export const DEFAULT_FAN_OFFER_PRICE = 0.1;

export const FAN_OFFER_LIST_PRICE_ENV_KEY = "FAN_OFFER_LIST_PRICE";
/** Strikethrough in offers — matches shop list price by default. */
export const DEFAULT_FAN_OFFER_LIST_PRICE = 0.15;

export const FAN_OFFER_TITLE_ENV_KEY = "FAN_OFFER_TITLE";
export const DEFAULT_FAN_OFFER_TITLE = "Refrigeração em promoção";

export const FAN_OFFER_DESCRIPTION_ENV_KEY = "FAN_OFFER_DESCRIPTION";
export const DEFAULT_FAN_OFFER_DESCRIPTION =
  "Sistemas de refrigeração para racks — instale embaixo das prateleiras no inventário.";

export const FAN_OFFER_ENDS_AT_ENV_KEY = "FAN_OFFER_ENDS_AT";
export const DEFAULT_FAN_OFFER_ENDS_AT = "2099-12-31T23:59:59.999Z";

export const FAN_IMAGE_URL_ENV_KEY = "FAN_IMAGE_URL";
export const DEFAULT_FAN_IMAGE_URL = "/media/fans/cooling-fan-system.svg";

export const FAN_MAX_BULK_QUANTITY_ENV_KEY = "FAN_MAX_BULK_QUANTITY";
export const DEFAULT_FAN_MAX_BULK_QUANTITY = 25;

function readPositiveNumber(raw: string | undefined | null, fallback: number): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = parseFloat(String(raw).trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readPositiveInt(raw: string | undefined | null, fallback: number): number {
  const n = readPositiveNumber(raw, fallback);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function readFanSalesAvailableAt(
  raw: string | undefined | null = process.env[FAN_SALES_AVAILABLE_AT_ENV_KEY],
): Date {
  const iso = raw == null || String(raw).trim() === "" ? DEFAULT_FAN_SALES_AVAILABLE_AT : String(raw).trim();
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return new Date(DEFAULT_FAN_SALES_AVAILABLE_AT);
  }
  return d;
}

export function readFanShopPrice(
  raw: string | undefined | null = process.env[FAN_SHOP_PRICE_ENV_KEY],
): number {
  return readPositiveNumber(raw, DEFAULT_FAN_SHOP_PRICE);
}

export function readFanOfferPrice(
  raw: string | undefined | null = process.env[FAN_OFFER_PRICE_ENV_KEY],
): number {
  return readPositiveNumber(raw, DEFAULT_FAN_OFFER_PRICE);
}

export function readFanOfferListPrice(
  raw: string | undefined | null = process.env[FAN_OFFER_LIST_PRICE_ENV_KEY],
): number {
  return readPositiveNumber(raw, DEFAULT_FAN_OFFER_LIST_PRICE);
}

export function readFanOfferTitle(
  raw: string | undefined | null = process.env[FAN_OFFER_TITLE_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_FAN_OFFER_TITLE;
  return String(raw).trim();
}

export function readFanOfferDescription(
  raw: string | undefined | null = process.env[FAN_OFFER_DESCRIPTION_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_FAN_OFFER_DESCRIPTION;
  return String(raw).trim();
}

export function readFanOfferEndsAt(
  raw: string | undefined | null = process.env[FAN_OFFER_ENDS_AT_ENV_KEY],
): Date {
  const iso = raw == null || String(raw).trim() === "" ? DEFAULT_FAN_OFFER_ENDS_AT : String(raw).trim();
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return new Date(DEFAULT_FAN_OFFER_ENDS_AT);
  return d;
}

export function readFanImageUrl(
  raw: string | undefined | null = process.env[FAN_IMAGE_URL_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_FAN_IMAGE_URL;
  return String(raw).trim();
}

export function readFanMaxBulkQuantity(
  raw: string | undefined | null = process.env[FAN_MAX_BULK_QUANTITY_ENV_KEY],
): number {
  return readPositiveInt(raw, DEFAULT_FAN_MAX_BULK_QUANTITY);
}

export function isFanPurchaseLiveAt(now: Date): boolean {
  return now.getTime() >= readFanSalesAvailableAt().getTime();
}
