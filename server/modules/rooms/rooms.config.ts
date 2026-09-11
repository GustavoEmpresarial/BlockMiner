/**
 * Room unlock pricing in BLK (1 BLK ≈ US$ 1).
 * List prices and optional promotional overrides — read via env, not magic numbers in call sites.
 */
import { ROOM_MAX } from "./rooms.types.js";

export const ROOM_CURRENCY = "BLK" as const;

export const ROOM_PRICES_ENV_KEY = "ROOM_PRICES";
/** Room 1 free, then 10 / 50 / 75 BLK at list price. */
export const DEFAULT_ROOM_PRICES_CSV = "0,10,50,75";

export const ROOM_OFFER_ACTIVE_ENV_KEY = "ROOM_OFFER_ACTIVE";
export const ROOM_OFFER_PRICES_ENV_KEY = "ROOM_OFFER_PRICES";
/** Product default promo: 50% off paid rooms (10→5, 50→25, 75→37.5). */
export const DEFAULT_ROOM_OFFER_PRICES_CSV = "0,5,25,37.5";

export const ROOM_OFFER_TITLE_ENV_KEY = "ROOM_OFFER_TITLE";
export const DEFAULT_ROOM_OFFER_TITLE = "Ofertas de Salas";

export const ROOM_OFFER_DESCRIPTION_ENV_KEY = "ROOM_OFFER_DESCRIPTION";
export const DEFAULT_ROOM_OFFER_DESCRIPTION =
  "Desbloqueie novas salas com desconto e expanda sua fazenda de mineração.";

export const ROOM_OFFER_STARTS_AT_ENV_KEY = "ROOM_OFFER_STARTS_AT";
export const ROOM_OFFER_ENDS_AT_ENV_KEY = "ROOM_OFFER_ENDS_AT";

export const ROOM_OFFER_IMAGE_URLS_ENV_KEY = "ROOM_OFFER_IMAGE_URLS";
/** One public URL per room, same order as ROOM_PRICES. */
export const DEFAULT_ROOM_OFFER_IMAGE_URLS_CSV =
  "/media/sala/room-1.webp,/media/sala/room-2.webp,/media/sala/room-3.webp,/media/sala/room-4.webp";

/** Promo on by default; set ROOM_OFFER_ACTIVE=0 to disable without redeploying prices. */
export const DEFAULT_ROOM_OFFER_ACTIVE = true;

export type RoomPriceQuote = {
  price: number;
  listPrice: number;
  onOffer: boolean;
  currency: typeof ROOM_CURRENCY;
};

function parsePriceCsv(raw: string, label: string): number[] {
  const parts = raw.split(",").map((v) => v.trim());
  const prices = parts.map((v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`invalid ${label} entry: ${v}`);
    }
    return n;
  });
  if (prices.length !== ROOM_MAX) {
    throw new Error(`${label} must have ${ROOM_MAX} comma-separated values`);
  }
  return prices;
}

export function readRoomListPrices(
  raw: string | undefined | null = process.env[ROOM_PRICES_ENV_KEY],
): number[] {
  const csv = raw == null || String(raw).trim() === "" ? DEFAULT_ROOM_PRICES_CSV : String(raw);
  return parsePriceCsv(csv, ROOM_PRICES_ENV_KEY);
}

export function readRoomOfferActiveFlag(
  raw: string | undefined | null = process.env[ROOM_OFFER_ACTIVE_ENV_KEY],
): boolean {
  if (raw == null || String(raw).trim() === "") return DEFAULT_ROOM_OFFER_ACTIVE;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function readRoomOfferPrices(
  raw: string | undefined | null = process.env[ROOM_OFFER_PRICES_ENV_KEY],
): number[] {
  const csv =
    raw == null || String(raw).trim() === "" ? DEFAULT_ROOM_OFFER_PRICES_CSV : String(raw);
  return parsePriceCsv(csv, ROOM_OFFER_PRICES_ENV_KEY);
}

export function readRoomOfferTitle(
  raw: string | undefined | null = process.env[ROOM_OFFER_TITLE_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_ROOM_OFFER_TITLE;
  return String(raw).trim();
}

export function readRoomOfferDescription(
  raw: string | undefined | null = process.env[ROOM_OFFER_DESCRIPTION_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_ROOM_OFFER_DESCRIPTION;
  return String(raw).trim();
}

export function readRoomOfferImageUrls(
  raw: string | undefined | null = process.env[ROOM_OFFER_IMAGE_URLS_ENV_KEY],
): string[] {
  const csv =
    raw == null || String(raw).trim() === "" ? DEFAULT_ROOM_OFFER_IMAGE_URLS_CSV : String(raw);
  const urls = csv.split(",").map((v) => v.trim()).filter(Boolean);
  if (urls.length !== ROOM_MAX) {
    throw new Error(`${ROOM_OFFER_IMAGE_URLS_ENV_KEY} must have ${ROOM_MAX} comma-separated URLs`);
  }
  return urls;
}

export function readRoomOfferImageUrl(roomNumber: number): string {
  const urls = readRoomOfferImageUrls();
  const url = urls[roomNumber - 1];
  if (!url) throw new Error(`no offer image configured for room ${roomNumber}`);
  return url;
}

export function getRoomOfferWindow(): { startsAt: Date; endsAt: Date } | null {
  const startsRaw = process.env[ROOM_OFFER_STARTS_AT_ENV_KEY];
  const endsRaw = process.env[ROOM_OFFER_ENDS_AT_ENV_KEY];
  const startsAt =
    startsRaw == null || String(startsRaw).trim() === ""
      ? new Date(0)
      : new Date(String(startsRaw).trim());
  const endsAt =
    endsRaw == null || String(endsRaw).trim() === ""
      ? new Date("2099-12-31T23:59:59.999Z")
      : new Date(String(endsRaw).trim());
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) return null;
  if (endsAt.getTime() < startsAt.getTime()) return null;
  return { startsAt, endsAt };
}

export function isRoomOfferActiveAt(now: Date): boolean {
  if (!readRoomOfferActiveFlag()) return false;
  const window = getRoomOfferWindow();
  if (!window) return false;
  const t = now.getTime();
  return t >= window.startsAt.getTime() && t <= window.endsAt.getTime();
}

export function getRoomPriceQuote(roomNumber: number, now: Date = new Date()): RoomPriceQuote {
  const index = roomNumber - 1;
  const listPrices = readRoomListPrices();
  const listPrice = listPrices[index] ?? 0;

  if (!isRoomOfferActiveAt(now)) {
    return { price: listPrice, listPrice, onOffer: false, currency: ROOM_CURRENCY };
  }

  const offerPrices = readRoomOfferPrices();
  const offerPrice = offerPrices[index] ?? listPrice;
  const onOffer = offerPrice < listPrice;
  return {
    price: onOffer ? offerPrice : listPrice,
    listPrice,
    onOffer,
    currency: ROOM_CURRENCY,
  };
}

/** @deprecated Prefer getRoomPriceQuote — kept for callers expecting list-only array. */
export function getRoomListPricesArray(): number[] {
  return readRoomListPrices();
}
