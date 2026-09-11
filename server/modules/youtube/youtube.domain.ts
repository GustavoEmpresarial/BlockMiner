/**
 * Pure calendar helpers for the youtube module, built on top of shared/calendar/utcCalendar.ts
 * (per project decision: UTC 00:00 reset everywhere, no per-module reimplementation of day
 * math — see current/server/shared/calendar/utcCalendar.ts header).
 */
import { getUtcDayKey, getUtcPeriodStartAt, getUtcPeriodResetAt } from "../../shared/calendar/utcCalendar.js";
import type { YoutubeDailyResetMeta } from "./youtube.types.js";

export function startOfUtcCalendarDay(now: Date = new Date()): Date {
  return getUtcPeriodStartAt(getUtcDayKey(now));
}

export function endOfUtcCalendarDay(now: Date = new Date()): Date {
  return getUtcPeriodResetAt(getUtcDayKey(now));
}

export function msUntilUtcDayReset(now: Date = new Date()): number {
  return Math.max(0, endOfUtcCalendarDay(now).getTime() - now.getTime());
}

export function utcDayDailyResetMeta(now: Date = new Date()): YoutubeDailyResetMeta {
  return {
    timezone: "UTC",
    localDate: getUtcDayKey(now),
    nextResetAt: endOfUtcCalendarDay(now).toISOString(),
    nextResetInMs: msUntilUtcDayReset(now),
  };
}
