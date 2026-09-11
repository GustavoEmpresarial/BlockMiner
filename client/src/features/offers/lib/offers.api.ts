import { api } from '../../../shared/auth/auth.store';

export interface OfferEventMinerDTO {
  id: number;
  isFree?: boolean;
  price?: number | string;
  claimLimitPerUser?: number;
  userClaimCount?: number;
  remaining?: number | null;
  imageUrl?: string | null;
  name?: string;
  hashRate?: number | string;
  inStock?: boolean;
  currency?: string;
  effectivelyFree?: boolean;
}

export interface OfferEventDTO {
  id: number;
  title?: string;
  startsAt?: string | null;
  endsAt?: string | null;
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
  salesAvailableAt?: string;
  isPurchaseLive?: boolean;
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
  items?: FanOfferItemDTO[];
};

export type RackOffersDTO = FanOffersDTO;
export type RackOfferItemDTO = FanOfferItemDTO;

export interface OfferEventsListResponse {
  ok?: boolean;
  events?: OfferEventDTO[];
  roomOffers?: RoomOffersDTO | null;
  fanOffers?: FanOffersDTO | null;
  rackOffers?: RackOffersDTO | null;
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
  fetchedAtMs: number;
};

let activeOffersCache: ActiveOffersCache | null = null;

export function readActiveOffersCache(): ActiveOffersCache | null {
  return activeOffersCache;
}

export function writeActiveOffersCache(next: Omit<ActiveOffersCache, 'fetchedAtMs'>): ActiveOffersCache {
  activeOffersCache = { ...next, fetchedAtMs: Date.now() };
  return activeOffersCache;
}

export function clearActiveOffersCache(): void {
  activeOffersCache = null;
}

export function getActiveOfferEvents() {
  return api.get<OfferEventsListResponse>('/offer-events/active');
}

export interface OfferEventPurchaseResponse {
  ok?: boolean;
  message?: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
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
