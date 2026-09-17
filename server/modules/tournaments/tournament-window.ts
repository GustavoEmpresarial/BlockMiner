// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { getUtcDayKey, getUtcPeriodStartAt } from "../../shared/calendar/utcCalendar.js";
const MS_DAY = 24 * 60 * 60 * 1000;
function utcDayStart(instant) {
    return getUtcPeriodStartAt(getUtcDayKey(instant));
}
/** Monday 00:00 UTC of the week containing `instant`. */
export function utcWeekStart(instant) {
    const day0 = utcDayStart(instant);
    const dow = day0.getUTCDay(); // 0=Sun … 6=Sat
    const daysSinceMonday = (dow + 6) % 7;
    return new Date(day0.getTime() - daysSinceMonday * MS_DAY);
}
/** Day 1 00:00 UTC of the month containing `instant`. */
export function utcMonthStart(instant) {
    return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), 1));
}
export function utcMonthEnd(monthStart) {
    return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
}
/**
 * Canonical UTC windows:
 *  - DAILY:   00:00 UTC → +24h
 *  - WEEKLY:  Monday 00:00 UTC → +7d
 *  - MONTHLY: day 1 00:00 UTC → day 1 next month
 */
export function snapWindowForType(type, anchor) {
    if (type === "DAILY") {
        const start = utcDayStart(anchor);
        return { start, end: new Date(start.getTime() + MS_DAY) };
    }
    if (type === "WEEKLY") {
        const start = utcWeekStart(anchor);
        return { start, end: new Date(start.getTime() + 7 * MS_DAY) };
    }
    if (type === "MONTHLY") {
        const start = utcMonthStart(anchor);
        return { start, end: utcMonthEnd(start) };
    }
    return null;
}

/**
 * Normalize an ACTIVE tournament to the canonical window of its own startsAt.
 * NEVER snap DAILY (or any type) to `now` — that slides the window forward and
 * skips finalize/payout for the previous cycle.
 */
export function snapWindowForActiveTournament(type, startsAt, _endsAt, _now = new Date()) {
    return snapWindowForType(type, startsAt);
}
