/** Ported from legacy/server/modules/internal-offerwall/internal-offerwall.config.ts. */

export const OFFER_KIND_PTC_IFRAME = "PTC_IFRAME";
export const OFFER_KIND_GENERAL_TASK = "GENERAL_TASK";

export const COMPLETION_USER_SELF_CLAIM = "USER_SELF_CLAIM";
export const COMPLETION_ADMIN_APPROVAL = "ADMIN_APPROVAL";

export const ATTEMPT_STATUS_STARTED = "STARTED";
export const ATTEMPT_STATUS_PENDING_REVIEW = "PENDING_REVIEW";
export const ATTEMPT_STATUS_COMPLETED = "COMPLETED";
export const ATTEMPT_STATUS_REJECTED = "REJECTED";

export const REWARD_BLK = "BLK";
export const REWARD_POL = "POL";
export const REWARD_HASHRATE_TEMP = "HASHRATE_TEMP";

/** Standard BLK payout per completed internal offerwall task (env override). */
export function internalOfferwallDefaultBlkReward(): number {
  const n = Number(process.env.INTERNAL_OFFERWALL_REWARD_BLK ?? "0.0005");
  if (!Number.isFinite(n) || n <= 0) return 0.0005;
  return Math.min(1000, n);
}

export const RESET_TYPE_DAILY = "DAILY";
export const RESET_TYPE_COOLDOWN = "COOLDOWN";

export function isInternalOfferwallEnabled(): boolean {
  const v = String(process.env.INTERNAL_OFFERWALL_ENABLED ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}
