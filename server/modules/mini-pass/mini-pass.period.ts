/**
 * Mission period keys — UTC calendar (product decision; legacy used Brazil day for LOGIN_DAY).
 */
import { getUtcDayKey, getUtcIsoWeekKey } from "../../shared/calendar/utcCalendar.js";
import {
  CADENCE_DAILY,
  CADENCE_EVENT,
  CADENCE_WEEKLY,
  EVENT_PERIOD_KEY,
  MISSION_LOGIN_DAY,
} from "./mini-pass.constants.js";

/**
 * Resolves the progress bucket for a mission.
 * LOGIN_DAY + DAILY uses UTC day key (aligned with shared/calendar — not Brazil check-in).
 */
export function resolveMissionPeriodKey(
  cadence: string,
  missionType: string,
  now: Date = new Date(),
): string {
  if (cadence === CADENCE_EVENT) return EVENT_PERIOD_KEY;

  if (missionType === MISSION_LOGIN_DAY) {
    if (cadence === CADENCE_EVENT) return EVENT_PERIOD_KEY;
    if (cadence === CADENCE_DAILY) return getUtcDayKey(now);
    if (cadence === CADENCE_WEEKLY) return getUtcIsoWeekKey(now);
    return getUtcDayKey(now);
  }

  if (cadence === CADENCE_DAILY) return getUtcDayKey(now);
  if (cadence === CADENCE_WEEKLY) return getUtcIsoWeekKey(now);
  return EVENT_PERIOD_KEY;
}
