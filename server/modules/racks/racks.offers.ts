import {
  RACK_CURRENCY,
  isRackPurchaseLiveAt,
  readRackOfferDescription,
  readRackOfferEndsAt,
  readRackSalesAvailableAt,
  readRackMaxBulkQuantity,
  readRackOfferTitle,
} from "./racks.config.js";
import { listRackCatalogForOffer, type RackCatalogItemPublic } from "./racks.catalog.js";

export type RackOffersPublic = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  salesAvailableAt: string;
  isLive: boolean;
  isPurchaseLive: boolean;
  currency: typeof RACK_CURRENCY;
  /** Echo of `readRackMaxBulkQuantity()` — client stepper must not invent a second cap. */
  maxBulkQuantity: number;
  items: RackCatalogItemPublic[];
};

export function buildActiveRackOffersPayload(now: Date = new Date()): RackOffersPublic | null {
  const endsAt = readRackOfferEndsAt();
  if (now.getTime() > endsAt.getTime()) return null;

  const salesAvailableAt = readRackSalesAvailableAt();
  const items = listRackCatalogForOffer(now);
  if (items.length === 0) return null;

  return {
    title: readRackOfferTitle(),
    description: readRackOfferDescription(),
    startsAt: new Date(0).toISOString(),
    endsAt: endsAt.toISOString(),
    salesAvailableAt: salesAvailableAt.toISOString(),
    isLive: true,
    isPurchaseLive: isRackPurchaseLiveAt(now),
    currency: RACK_CURRENCY,
    maxBulkQuantity: readRackMaxBulkQuantity(),
    items,
  };
}
