/** Stable report codes for Multiwall. The postback body stays the partner text. */
export const MULTIWALL_ERROR = {
  POSTBACK_FAILED: "MULTIWALL_POSTBACK_FAILED",
  HISTORY_FAILED: "MULTIWALL_HISTORY_FAILED",
  STATS_FAILED: "MULTIWALL_STATS_FAILED",
  EMBED_FAILED: "MULTIWALL_EMBED_FAILED",
} as const;

export type MultiwallErrorCode = (typeof MULTIWALL_ERROR)[keyof typeof MULTIWALL_ERROR];
