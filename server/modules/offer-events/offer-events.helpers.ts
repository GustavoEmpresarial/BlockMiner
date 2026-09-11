/** Pure helpers ported from legacy/server/services/offerEventHelpers.ts */
import { DEFAULT_OFFER_CURRENCY } from "./offer-events.config.js";

const CURRENCY_TO_USER_FIELD: Record<string, string> = {
  POL: "polBalance",
  BLK: "blkBalance",
  BTC: "btcBalance",
  ETH: "ethBalance",
  USDT: "usdtBalance",
  USDC: "usdcBalance",
  ZER: "zerBalance",
};

export const SUPPORTED_OFFER_CURRENCIES = Object.keys(CURRENCY_TO_USER_FIELD);

export type OfferEventLike = {
  startsAt: Date | string;
  endsAt: Date | string;
  isActive: boolean;
  deletedAt?: Date | string | null;
};

export type EventMinerStockLike = {
  isActive: boolean;
  stockUnlimited: boolean;
  stockCount: number | null;
  soldCount: number;
};

export function normalizeOfferCurrency(currency: unknown): string {
  const c = String(currency || DEFAULT_OFFER_CURRENCY).toUpperCase();
  return CURRENCY_TO_USER_FIELD[c] ? c : DEFAULT_OFFER_CURRENCY;
}

export function userBalanceFieldForCurrency(currency: unknown): string {
  return CURRENCY_TO_USER_FIELD[normalizeOfferCurrency(currency)]!;
}

export function getUserBalanceNumber(user: Record<string, unknown> | null | undefined, currency: unknown): number {
  const field = userBalanceFieldForCurrency(currency);
  return Number(user?.[field] ?? 0);
}

export function isOfferEventLiveAt(now: Date, event: OfferEventLike | null | undefined): boolean {
  if (!event || event.deletedAt) return false;
  if (!event.isActive) return false;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  return t >= start && t <= end;
}

export function isOfferEventActiveForPublic(now: Date, event: OfferEventLike): boolean {
  return isOfferEventLiveAt(now, event);
}

export function hasEventMinerStock(miner: EventMinerStockLike | null | undefined): boolean {
  if (!miner?.isActive) return false;
  if (miner.stockUnlimited) return true;
  if (miner.stockCount == null) return false;
  return miner.soldCount < miner.stockCount;
}

export function filterPublicOfferEvents<T extends OfferEventLike>(events: T[], now: Date): T[] {
  return events.filter((e) => isOfferEventActiveForPublic(now, e));
}

export function buildPublicOfferEventsWhere(now: Date) {
  return {
    deletedAt: null,
    isActive: true,
    endsAt: { gte: now },
  };
}

export function toDecimalPrice(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error("invalid price");
  return String(n);
}

export function mapBalances(user: Record<string, unknown> | null | undefined): Record<string, number> {
  if (!user) return {};
  return {
    polBalance: Number(user.polBalance ?? 0),
    blkBalance: Number(user.blkBalance ?? 0),
    btcBalance: Number(user.btcBalance ?? 0),
    ethBalance: Number(user.ethBalance ?? 0),
    usdtBalance: Number(user.usdtBalance ?? 0),
    usdcBalance: Number(user.usdcBalance ?? 0),
    zerBalance: Number(user.zerBalance ?? 0),
  };
}
