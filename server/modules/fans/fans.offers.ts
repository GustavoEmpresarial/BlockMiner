import {
  FAN_CURRENCY,
  isFanPurchaseLiveAt,
  isFansFeatureEnabled,
  readFanOfferDescription,
  readFanOfferEndsAt,
  readFanSalesAvailableAt,
  readFanMaxBulkQuantity,
  readFanOfferTitle,
} from "./fans.config.js";
import { listFanCatalogForOffer, type FanCatalogItemPublic } from "./fans.catalog.js";

export type FanOffersPublic = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  salesAvailableAt: string;
  isLive: boolean;
  isPurchaseLive: boolean;
  currency: typeof FAN_CURRENCY;
  /** Echo of `readFanMaxBulkQuantity()` — client stepper must not invent a second cap. */
  maxBulkQuantity: number;
  items: FanCatalogItemPublic[];
};

export function buildActiveFanOffersPayload(now: Date = new Date()): FanOffersPublic | null {
  if (!isFansFeatureEnabled()) return null;
  const endsAt = readFanOfferEndsAt();
  if (now.getTime() > endsAt.getTime()) return null;

  const salesAvailableAt = readFanSalesAvailableAt();
  const items = listFanCatalogForOffer(now);
  if (items.length === 0) return null;

  return {
    title: readFanOfferTitle(),
    description: readFanOfferDescription(),
    startsAt: new Date(0).toISOString(),
    endsAt: endsAt.toISOString(),
    salesAvailableAt: salesAvailableAt.toISOString(),
    isLive: true,
    isPurchaseLive: isFanPurchaseLiveAt(now),
    currency: FAN_CURRENCY,
    maxBulkQuantity: readFanMaxBulkQuantity(),
    items,
  };
}
