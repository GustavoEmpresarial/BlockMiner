/** Ported from legacy/server/modules/shortlinks — HTTP-facing error codes for the controller. */
export const SHORTLINK_ERROR = {
  NO_SESSION: "SHORTLINK_NO_SESSION",
  DAILY_LIMIT: "SHORTLINK_DAILY_LIMIT",
  DETECTED: "SHORTLINK_DETECTED",
  INVALID_STEP: "SHORTLINK_INVALID_STEP",
  INTERNAL: "SHORTLINK_INTERNAL_ERROR",
  TOO_FAST: "SHORTLINK_TOO_FAST",
  EXPIRED: "SHORTLINK_EXPIRED",
  DISABLED: "SHORTLINK_DISABLED",
  ZERADS_API: "SHORTLINK_ZERADS_API",
  ADLINKFLY_API: "SHORTLINK_ADLINKFLY_API",
  /** Claim attempted before ZerAds success redirect marked the session done. */
  NOT_COMPLETED: "SHORTLINK_NOT_COMPLETED",
} as const;

export type ShortlinkErrorCode = (typeof SHORTLINK_ERROR)[keyof typeof SHORTLINK_ERROR];
