/** Ported from legacy/server/utils/readEarnConstants.ts. */

/** Temporary mining power boost (UserPowerGame), same pattern as check-in milestones. */
export const READ_EARN_HASHRATE = "hashrate";
/** Credits user BLK balance (non-withdrawable pool token). */
export const READ_EARN_BLK = "blk";
/** Grants one inventory row from catalog Miner. */
export const READ_EARN_MACHINE = "machine";

export const READ_EARN_REWARD_TYPES = [READ_EARN_HASHRATE, READ_EARN_BLK, READ_EARN_MACHINE] as const;
export type ReadEarnRewardType = (typeof READ_EARN_REWARD_TYPES)[number];

/** Generic client-facing failure (wrong code, inactive, full, misconfigured). */
export const REDEEM_GENERIC = "READ_EARN_UNAVAILABLE";
/** User already redeemed this campaign. */
export const REDEEM_ALREADY = "READ_EARN_ALREADY_CLAIMED";

export const READ_EARN_GAME_SLUG = "read-earn-partner";

/** Milliseconds in a 24-hour day */
export const MS_PER_DAY = 86_400_000;
/** Default validity in days for hashrate power boost */
export const DEFAULT_HASHRATE_VALIDITY_DAYS = 7;
/** Level boundaries for rewarded machine */
export const MINER_LEVEL_MIN = 1;
export const MINER_LEVEL_MAX = 100;
/** Maximum stored string length for user telemetry on redemption */
export const READ_EARN_IP_MAX_LENGTH = 64;
export const READ_EARN_UA_MAX_LENGTH = 512;
/** Rate limiting for campaign redemption attempts */
export const REDEEM_RATE_WINDOW_MS = 15 * 60 * 1000;
export const REDEEM_RATE_MAX = 20;
/** Pagination defaults for admin redemptions listing */
export const REDEMPTIONS_DEFAULT_TAKE = 50;
export const REDEMPTIONS_MAX_TAKE = 100;

