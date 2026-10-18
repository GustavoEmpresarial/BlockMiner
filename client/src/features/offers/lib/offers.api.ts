import { isAxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';

/**
 * Event-miner stepper + `POST /offer-events/purchase` body.
 * Must match `OFFER_EVENT_PURCHASE_MAX_QUANTITY` on the server.
 * Fan/rack use `fanOffers.maxBulkQuantity` / `rackOffers.maxBulkQuantity` from GET /active.
 */
export const OFFER_PURCHASE_MAX_QUANTITY = 25;

/** Mirrors `serializeMinerPublic` — extra fields stay optional for cache/partials. */
export interface OfferEventMinerDTO {
  id: number;
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  modelUrl?: string | null;
  deliveryDelayDays?: number;
  /** ISO time when a delayed miner opens for sale (event start + delay). */
  releaseAt?: string | null;
  /** False until releaseAt — buy is blocked. */
  onSale?: boolean;
  pendingDeliveryAt?: string | null;
  price?: number | string;
  hashRate?: number | string;
  currency?: string;
  slotSize?: number;
  inStock?: boolean;
  remaining?: number | null;
  isFree?: boolean;
  claimLimitPerUser?: number;
  userClaimCount?: number;
  /** Client-only: `isFree || Number(price) === 0`. */
  effectivelyFree?: boolean;
}

/** Mirrors `serializeEventPublic`. */
export interface OfferEventDTO {
  id: number;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  isLive?: boolean;
  miners?: OfferEventMinerDTO[];
}

export interface FanOfferItemDTO {
  sku: string;
  nameKey: string;
  descriptionKey: string;
  price: number;
  listPrice: number;
  currency: string;
  imageUrl?: string | null;
  creditsPerUnit?: number;
  salesAvailableAt?: string;
  isPurchaseLive?: boolean;
  maxQuantity?: number;
}

export type FanOffersDTO = {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  salesAvailableAt?: string;
  isLive?: boolean;
  isPurchaseLive?: boolean;
  currency?: string;
  maxBulkQuantity?: number;
  items?: FanOfferItemDTO[];
};

export type RackOffersDTO = FanOffersDTO;
export type RackOfferItemDTO = FanOfferItemDTO;

/** Mirrors `listPartsCatalogForOffer` — one row per (slug, rarity). */
export interface PartOfferItemDTO {
  slug: string;
  rarity: string;
  nameKey: string;
  price: number;
  listPrice: number;
  currency: string;
  imageUrl?: string | null;
}

/** Mirrors `PART_OFFER_PACKS`. */
export interface PartPackDTO {
  id: string;
  nameKey: string;
  descriptionKey: string;
  price: number;
  currency: string;
  badgeKey?: string;
  items: { slug: string; rarity: string; quantity: number }[];
}

/** Mirrors `buildActivePartOffersPayload`. */
export interface PartOffersDTO {
  titleKey?: string;
  descriptionKey?: string;
  isLive?: boolean;
  currency?: string;
  items?: PartOfferItemDTO[];
  packs?: PartPackDTO[];
}

/** UI stepper cap for one part; the server accepts up to 10 000 per request. */
export const PART_OFFER_MAX_QUANTITY = 100;

export interface OfferEventsListResponse {
  ok?: boolean;
  events?: OfferEventDTO[];
  roomOffers?: RoomOffersDTO | null;
  fanOffers?: FanOffersDTO | null;
  rackOffers?: RackOffersDTO | null;
  partOffers?: PartOffersDTO | null;
  serverTime?: string;
}

export interface RoomOfferItemDTO {
  roomNumber: number;
  price: number;
  listPrice: number;
  currency: string;
  discountPercent: number;
  imageUrl?: string | null;
}

export interface RoomOffersDTO {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  isLive?: boolean;
  currency?: string;
  rooms?: RoomOfferItemDTO[];
}

/** Survives OffersPage remount when navigating sidebar tabs (SPA). */
export type ActiveOffersCache = {
  events: OfferEventDTO[];
  roomOffers: RoomOffersDTO | null;
  fanOffers: FanOffersDTO | null;
  rackOffers: RackOffersDTO | null;
  partOffers?: PartOffersDTO | null;
  userId?: number;
  fetchedAtMs: number;
};

let activeOffersCache: ActiveOffersCache | null = null;

export function readActiveOffersCache(expectedUserId?: number): ActiveOffersCache | null {
  if (!activeOffersCache) return null;
  if (expectedUserId != null && activeOffersCache.userId !== expectedUserId) return null;
  return activeOffersCache;
}

export function writeActiveOffersCache(
  next: Omit<ActiveOffersCache, 'fetchedAtMs' | 'userId'>,
  userId?: number,
): ActiveOffersCache {
  activeOffersCache = { ...next, userId, fetchedAtMs: Date.now() };
  return activeOffersCache;
}

export function clearActiveOffersCache(): void {
  activeOffersCache = null;
}

export function hasLiveRoomOffers(roomOffers: RoomOffersDTO | null | undefined): boolean {
  return Boolean(roomOffers?.isLive && (roomOffers.rooms?.length ?? 0) > 0);
}

export function hasLiveGearOffers(offers: FanOffersDTO | null | undefined): boolean {
  return Boolean(offers?.isLive && (offers.items?.length ?? 0) > 0);
}

export function hasLivePartOffers(offers: PartOffersDTO | null | undefined): boolean {
  return Boolean(offers?.isLive && ((offers.items?.length ?? 0) > 0 || (offers.packs?.length ?? 0) > 0));
}

/** Rounded discount vs the shop price; 0 when there is none (no badge then). */
export function partDiscountPercent(price: number, listPrice: number): number {
  if (!(listPrice > 0) || !(price < listPrice)) return 0;
  return Math.round((1 - price / listPrice) * 100);
}

/** Badge da sidebar e empty-state da /offers — mesma regra, um dono. */
export function isActiveOffersPayloadLive(body: OfferEventsListResponse | null | undefined): boolean {
  if (!body) return false;
  const events = Array.isArray(body.events) ? body.events : [];
  return (
    events.length > 0 ||
    hasLiveRoomOffers(body.roomOffers) ||
    hasLiveGearOffers(body.fanOffers) ||
    hasLiveGearOffers(body.rackOffers) ||
    hasLivePartOffers(body.partOffers)
  );
}

export function readGearMaxBulkQuantity(offers: FanOffersDTO | null | undefined): number {
  const n = Number(offers?.maxBulkQuantity);
  return Number.isInteger(n) && n >= 1 ? n : OFFER_PURCHASE_MAX_QUANTITY;
}

/**
 * Fan/rack errors ship `messageKey` + English `message`. Prefer the key so /offers
 * stays in the user's locale; fall back to `message` if i18n misses the key.
 */
export function readOfferPurchaseError(
  err: unknown,
  fallback: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!isAxiosError(err)) return fallback;
  const data = err.response?.data;
  if (!data || typeof data !== 'object') return fallback;
  const rec = data as { messageKey?: unknown; messageParams?: unknown; message?: unknown };
  if (typeof rec.messageKey === 'string' && rec.messageKey) {
    const params =
      rec.messageParams && typeof rec.messageParams === 'object'
        ? (rec.messageParams as Record<string, unknown>)
        : undefined;
    const translated = t(rec.messageKey, params);
    if (translated !== rec.messageKey) return translated;
  }
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
  return fallback;
}

export function getActiveOfferEvents() {
  return api.get<OfferEventsListResponse>('/offer-events/active');
}

export interface OfferEventPurchaseResponse {
  ok?: boolean;
  message?: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  code?: string;
  balances?: Record<string, number>;
  newBalance?: number;
  fanCredits?: number;
  rackCredits?: number;
}

export function postOfferEventPurchase(body: { eventMinerId: number; quantity: number }) {
  return api.post<OfferEventPurchaseResponse>('/offer-events/purchase', body);
}

export function postOfferFanPurchase(body: { sku: string; quantity: number }) {
  return api.post<OfferEventPurchaseResponse>('/offer-events/purchase-fan', body);
}

export function postOfferRackPurchase(body: { sku: string; quantity: number }) {
  return api.post<OfferEventPurchaseResponse>('/offer-events/purchase-rack', body);
}

export function postOfferPartPurchase(body: { slug: string; rarity: string; quantity: number }) {
  return api.post<OfferEventPurchaseResponse>('/offer-events/purchase-part', body);
}

export function postOfferPartPackPurchase(body: { packId: string }) {
  return api.post<OfferEventPurchaseResponse>('/offer-events/purchase-part-pack', body);
}
