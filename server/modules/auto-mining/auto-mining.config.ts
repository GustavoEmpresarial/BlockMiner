/** V1 GPU claim limits — ported 1:1 from legacy/server/modules/auto-mining/domain/auto-mining.config.ts */
export const V1_DAILY_LIMIT = 24;
export const V1_CLAIM_COST_SECONDS = 300;

/** V2 session constants — mirrored in auto-mining.domain.ts for pure-function use */
export const V2_NORMAL_HASH_PER_CYCLE = 10;
export const V2_TURBO_HASH_PER_CYCLE = 10;
export const V2_CYCLE_SECONDS = 60;
export const V2_DAILY_LIMIT_HASH = 1000;
export const V2_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
export const V2_CLICK_GRACE_MS = 3 * 60 * 1000;
export const V2_MIN_CLICK_DELAY_MS = 400;
export const V2_NEGATIVE_CACHE_MS = 45_000;
/** No heartbeat this long → session timer resyncs; claims require fresher proof of presence.
 *  Must exceed the client's 10s heartbeat interval by enough to survive one dropped beat. */
export const V2_HEARTBEAT_STALE_MS = 40_000;
/** Presence required per claim. Deliberately BELOW V2_CYCLE_SECONDS: a client heartbeating
 *  every 10s credits ~60s per 60s cycle, so requiring the full 60 left zero margin and any
 *  single jittered beat permanently stalled the claim. The ~15s surplus absorbs that. */
export const V2_CLAIM_REQUIRED_SECONDS = 45;
/** Seconds balance debited per successful v2 claim. Kept equal to the required amount so the
 *  balance starts each cycle at 0 and surplus presence cannot be hoarded across cycles. */
export const V2_CLAIM_SECONDS_COST = V2_CLAIM_REQUIRED_SECONDS;
