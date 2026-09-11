/**
 * Ported from legacy/server/modules/checkin/checkin.notifications.ts.
 *
 * DEVIATION (documented, same convention as shared/security/mailer.ts): legacy fires three
 * cross-module hooks after a confirmed check-in — `notifyMiniPassLoginDay` (mini-pass module),
 * `notifyDailyTaskLoginDay` (daily-tasks module), `notifyTournamentScoreIncrement` (tournament
 * scoring). As of Fase 10d, `notifyDailyTaskLoginDay` IS wired for real (tasks/ module ported —
 * see current/docs/PROGRESSO.txt entry 10d). As of this fix, `notifyMiniPassLoginDay` is ALSO
 * wired for real (mini-pass/ module ported — see mini-pass/index.ts). The generic
 * tournament-score-increment hook still doesn't exist in current/ (tournaments/index.ts only
 * exposes `recordTournamentAction`, not a generic score hook) — that one remains a documented
 * no-op below.
 */
import { logger } from "../../core/logger/index.js";
import { applyStreakMilestoneRewards } from "./checkin.milestones.js";
import { notifyDailyTaskLoginDay } from "../tasks/index.js";
import { notifyMiniPassLoginDay } from "../mini-pass/index.js";

const log = logger.child("checkin.notifications");

export function logCheckinSideEffectFailure(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  log.warn(label, { error: msg });
}

/**
 * Fire all side-effects after a confirmed daily check-in.
 * Milestone rewards, the daily-task login-day hook, and the mini-pass login-day hook are
 * awaited (each isolated with .catch() so one failing never breaks the check-in flow or the
 * others); the generic tournament-score hook is a documented no-op (see header).
 */
export async function fireCheckinSideEffects(userId: number, periodKey: string): Promise<void> {
  await applyStreakMilestoneRewards(userId).catch((e: unknown) =>
    logCheckinSideEffectFailure("applyStreakMilestoneRewards after checkin", e),
  );
  await notifyDailyTaskLoginDay(userId, periodKey).catch((e: unknown) =>
    logCheckinSideEffectFailure("notifyDailyTaskLoginDay after checkin", e),
  );
  await notifyMiniPassLoginDay(userId, periodKey).catch((e: unknown) =>
    logCheckinSideEffectFailure("notifyMiniPassLoginDay after checkin", e),
  );
  log.debug("tournament-score generic hook skipped (not ported yet)", { userId, periodKey });
}
