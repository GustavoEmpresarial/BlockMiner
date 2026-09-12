/** Public boundary of the public-stats module. Other modules should not need to import this. */
export { publicStatsRouter } from "./public-stats.routes.js";
export { getPublicLiveStats } from "./public-stats.service.js";
export { PUBLIC_STATS_ERROR, type PublicStatsErrorCode } from "./public-stats.errors.js";
// Dead re-export removed: PublicStatsResponse/PublicFeedResponse/PublicFeedRow/PublicLiveStats
// never existed in public-stats.types.ts (that file is `export {}` only — a stub left behind
// when this module was reconstructed from a stale compiled dist/, see its file header) and
// nothing outside this module imported them. If typed response shapes are wanted later, type
// getPublicLiveStats/getPublicStats/getPublicFeed directly rather than re-adding unused re-exports.
