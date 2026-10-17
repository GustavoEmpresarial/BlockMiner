/**
 * Ported from legacy/server/services/dailyTasks/dailyTaskConstants.ts.
 */

/** Server-side task kinds (must match `daily_task_definitions.task_type`). */
export const TASK_LOGIN_DAY = "LOGIN_DAY";
export const TASK_MINE_BLK = "MINE_BLK";
export const TASK_PLAY_GAMES = "PLAY_GAMES";
export const TASK_WATCH_YOUTUBE = "WATCH_YOUTUBE";
/** Counts internal offerwall completions (PTC / general) when hooked from offer flow. */
export const TASK_INTERNAL_OFFERWALL = "INTERNAL_OFFERWALL";
/** Any offerwall credit (internal, Offerwall.me, Zerads, MoneyRain, Multiwall, Offerwall.GG). */
export const TASK_COMPLETE_OFFERS = "COMPLETE_OFFERS";
export const TASK_CLAIM_FAUCET = "CLAIM_FAUCET";
export const TASK_COMPLETE_SHORTLINKS = "COMPLETE_SHORTLINKS";
export const TASK_AUTO_MINING_CLAIMS = "AUTO_MINING_CLAIMS";
export const TASK_MERGE_MACHINES = "MERGE_MACHINES";
export const TASK_BURN_CLAIMS = "BURN_CLAIMS";
export const TASK_QUALIFIED_REFERRALS = "QUALIFIED_REFERRALS";

/**
 * Task progress fed by the normalized tournament action stream. YouTube, minigames and
 * check-in keep their own hooks (WATCH_YOUTUBE / PLAY_GAMES / LOGIN_DAY) and are not listed.
 */
export const TASK_TYPE_BY_ACTION_PROVIDER: Record<string, string> = {
  internal: TASK_COMPLETE_OFFERS,
  offerwallme: TASK_COMPLETE_OFFERS,
  zerads: TASK_COMPLETE_OFFERS,
  moneyrain: TASK_COMPLETE_OFFERS,
  multiwall: TASK_COMPLETE_OFFERS,
  offerwallgg: TASK_COMPLETE_OFFERS,
  faucet: TASK_CLAIM_FAUCET,
  shortlink: TASK_COMPLETE_SHORTLINKS,
  auto_mining: TASK_AUTO_MINING_CLAIMS,
  merge: TASK_MERGE_MACHINES,
  burn: TASK_BURN_CLAIMS,
  referral: TASK_QUALIFIED_REFERRALS,
};

export const ADMIN_CREATE_TASK_TYPES = [
  TASK_LOGIN_DAY,
  TASK_MINE_BLK,
  TASK_PLAY_GAMES,
  TASK_WATCH_YOUTUBE,
  TASK_INTERNAL_OFFERWALL,
  TASK_COMPLETE_OFFERS,
  TASK_CLAIM_FAUCET,
  TASK_COMPLETE_SHORTLINKS,
  TASK_AUTO_MINING_CLAIMS,
  TASK_MERGE_MACHINES,
  TASK_BURN_CLAIMS,
  TASK_QUALIFIED_REFERRALS,
];

export const ADMIN_CREATE_REWARD_KINDS = ["BLK", "POL", "HASHRATE_TEMP", "SHOP_MINER", "EVENT_MINER"];

/** Client-facing progress states. */
export const STATUS_AVAILABLE = "available";
export const STATUS_IN_PROGRESS = "in_progress";
export const STATUS_COMPLETED = "completed";
export const STATUS_CLAIMED = "claimed";
