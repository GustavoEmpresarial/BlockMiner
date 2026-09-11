/** Public boundary of the auto-mining module — only what's exported here may be imported by
 *  other modules or by bootstrap/routes.ts. */
export { autoMiningRouter } from "./auto-mining.routes.js";
export { autoMiningAdminRouter } from "./auto-mining.admin.routes.js";
export { isAutoMiningV2SchemaAvailable, resetAutoMiningV2AvailabilityCache } from "./auto-mining.db-availability.js";
export { removeExpiredGPUs } from "./auto-mining.repository.js";
/** Consumed by the future cron integration pass:
 *    - cleanupStaleAutoMiningV2Impressions(): deletes unclaimed turbo banner impressions
 *      older than 7 days (mirrors legacy's call inside the same cron interval).
 *    - deactivateStaleAutoMiningSessions(staleMs?): flips zombie `isActive` sessions to false
 *      for tabs that were closed without an explicit stop (mirrors
 *      legacy/server/cron/autoMiningSessionCleanupCron.ts's deactivateStaleAutoMiningSessions).
 *      Defaults to the same 30-minute staleness window; pass a custom value to match
 *      AUTO_MINING_SESSION_STALE_MS if the cron wants to keep reading that env var itself. */
export { cleanupStaleAutoMiningV2Impressions, deactivateStaleAutoMiningSessions, } from "./auto-mining.v2.service.js";
