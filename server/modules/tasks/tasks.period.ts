/**
 * Ported from legacy/server/services/dailyTasks/dailyTaskPeriod.ts.
 *
 * DAILY cadence reuses server/shared/calendar/utcCalendar.ts (getUtcDayKey / getUtcPeriodResetAt)
 * per doctrine — same UTC-00:00 boundary legacy already computed for daily tasks (legacy's own
 * dailyTaskPeriod.ts never used the Brazil/America-Sao_Paulo timezone either, only checkin/
 * energy-tax/faucet did — this is a straight port, not a deviation). WEEKLY/MONTHLY cadences have
 * no shared/ helper (only mini-pass module used ISO-week buckets in legacy, and mini-pass isn't
 * ported here), so their math is kept local to this module.
 */
import { getUtcDayKey, getUtcIsoWeekKey, getUtcPeriodResetAt } from "../../shared/calendar/utcCalendar.js";

export const DAILY_TASK_RESET_DAILY = "DAILY";
export const DAILY_TASK_RESET_WEEKLY = "WEEKLY";
export const DAILY_TASK_RESET_MONTHLY = "MONTHLY";

export const DAILY_TASK_RESET_CADENCES = [
  DAILY_TASK_RESET_DAILY,
  DAILY_TASK_RESET_WEEKLY,
  DAILY_TASK_RESET_MONTHLY,
] as const;

export type DailyTaskResetCadence = (typeof DAILY_TASK_RESET_CADENCES)[number];

export function normalizeDailyTaskResetCadence(cadence: unknown): DailyTaskResetCadence {
  const v = typeof cadence === "string" ? cadence.trim().toUpperCase() : "";
  if ((DAILY_TASK_RESET_CADENCES as readonly string[]).includes(v)) return v as DailyTaskResetCadence;
  return DAILY_TASK_RESET_DAILY;
}

function utcMonthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Calendar bucket for daily tasks (UTC 00:00 boundary — site-wide product decision). */
export function getDailyTaskPeriodKey(now: Date = new Date(), cadence: DailyTaskResetCadence = DAILY_TASK_RESET_DAILY): string {
  const c = normalizeDailyTaskResetCadence(cadence);
  if (c === DAILY_TASK_RESET_WEEKLY) return getUtcIsoWeekKey(now);
  if (c === DAILY_TASK_RESET_MONTHLY) return utcMonthKey(now);
  return getUtcDayKey(now);
}

/** Next instant when the current period advances (for UI countdown). */
export function getNextDailyTaskResetAt(now: Date = new Date(), cadence: DailyTaskResetCadence = DAILY_TASK_RESET_DAILY): Date {
  const c = normalizeDailyTaskResetCadence(cadence);
  if (c === DAILY_TASK_RESET_WEEKLY) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
    const daysUntilNextMonday = 8 - dayNum;
    d.setUTCDate(d.getUTCDate() + daysUntilNextMonday);
    return d;
  }
  if (c === DAILY_TASK_RESET_MONTHLY) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }
  // Next 00:00 UTC — same math as getUtcPeriodResetAt(getUtcDayKey(now)).
  return getUtcPeriodResetAt(getUtcDayKey(now));
}
