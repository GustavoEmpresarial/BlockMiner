/** Stable report codes for offer-events. Client-facing messages stay in the controller. */
export const OFFER_EVENTS_ERROR = {
  LIST_FAILED: "OFFER_EVENTS_LIST_FAILED",
  PURCHASE_FAILED: "OFFER_EVENTS_PURCHASE_FAILED",
  FAN_PURCHASE_FAILED: "OFFER_EVENTS_FAN_PURCHASE_FAILED",
  RACK_PURCHASE_FAILED: "OFFER_EVENTS_RACK_PURCHASE_FAILED",
} as const;

export type OfferEventsErrorCode = (typeof OFFER_EVENTS_ERROR)[keyof typeof OFFER_EVENTS_ERROR];
