export { checkinRouter } from "./checkin.routes.js";
export { checkinAdminRouter } from "./checkin.admin.routes.js";
export {
  balanceCheckinSyntheticTxHash,
  processStalePendingCheckins,
  tryFinalizeCheckinRow,
  tryFinalizeTodayCheckin,
} from "./checkin.service.js";
export { CheckinHttpError, mapCheckinError } from "./checkin.errors.js";
/** Consumed by the stats module (GET /api/stats/power) to compute the user's live streak. */
export { computeCheckinStreak, resolveLiveStreakFromRows } from "./checkin.streak.js";
export { getCheckinGraceHours } from "./checkin.config.js";
export { detectStreakAnomalies, runCheckinStreakMonitor, scanRecentStreakAnomalies } from "./checkin.monitor.js";
