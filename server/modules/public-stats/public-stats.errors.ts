export const PUBLIC_STATS_ERROR = {
  LIVE_STATS_FAILED: "live_stats_failed",
} as const;

export type PublicStatsErrorCode = (typeof PUBLIC_STATS_ERROR)[keyof typeof PUBLIC_STATS_ERROR];
