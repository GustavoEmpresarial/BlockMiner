/** Default checkout currency for offer-event miners (matches shop: BLK). */
export const DEFAULT_OFFER_CURRENCY = "BLK" as const;

/**
 * Hard cap for `POST /offer-events/purchase` (event miners).
 * Must stay in lockstep with `OFFER_PURCHASE_MAX_QUANTITY` on the client
 * (`client/src/features/offers/lib/offers.api.ts`). Fan/rack bulk caps live in
 * `FAN_MAX_BULK_QUANTITY` / `RACK_MAX_BULK_QUANTITY` and are echoed on
 * `GET /offer-events/active` as `maxBulkQuantity`.
 */
export const OFFER_EVENT_PURCHASE_MAX_QUANTITY = 25;

export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MIN = 5;
export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX = 100;

export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MIN = 5;
export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_DEFAULT = 100;
export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX = 200;
