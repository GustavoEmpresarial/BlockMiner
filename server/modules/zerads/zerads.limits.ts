/**
 * Ported from legacy/server/modules/zerads/zeradsClickLimits.ts.
 *
 * Deviation (explicit product decision, see current/server/shared/calendar/utcCalendar.ts):
 * legacy shipped its own local `utcDayBounds`/`utcDayKey`/`utcDayStart` helpers inside this
 * file. current/ already standardized every daily-limit module (checkin/, energy-tax/,
 * faucet/, games/) on shared/calendar/utcCalendar.ts's UTC 00:00 day-boundary utilities —
 * this file reuses those instead of reimplementing day-bounds math. The legacy env var alias
 * `ZERADS_MAX_CLICKS_PER_BRT_DAY` is kept for `.env.production` backward compatibility even
 * though "BRT" no longer describes the boundary (it's UTC now, not America/Sao_Paulo 21h).
 */
import { getUtcDayKey, getUtcPeriodStartAt, getUtcPeriodResetAt } from "../../shared/calendar/utcCalendar.js";

/** Zerads PTC: max clicks per UTC calendar day (site-wide UTC 00:00 boundary). */
export const ZERADS_MAX_CLICKS_PER_UTC_DAY = Math.max(
  1,
  parseInt(
    process.env.ZERADS_MAX_CLICKS_PER_UTC_DAY ?? process.env.ZERADS_MAX_CLICKS_PER_BRT_DAY ?? "100",
    10,
  ) || 100,
);

/** UTC-day [start, end) bounds for the callback's `now`, using the site-wide UTC calendar util. */
export function zeradsUtcDayBounds(now: Date): { start: Date; end: Date } {
  const dayKey = getUtcDayKey(now);
  return { start: getUtcPeriodStartAt(dayKey), end: getUtcPeriodResetAt(dayKey) };
}

export function capZeradsClicksForUtcDay(clicks: number): number {
  return Math.min(Math.max(0, Math.trunc(clicks)), ZERADS_MAX_CLICKS_PER_UTC_DAY);
}

export type ZeradsClickTotals = { raw: number; credited: number };

/** Sum clicks per user with per-UTC-day cap — same rule as ingest. Used by reporting/admin, not the hot path. */
export function aggregateZeradsClicksPerUser(
  rows: { userId: number; callbackAt: Date; clicks: number }[],
): Map<number, ZeradsClickTotals> {
  const byUserDay = new Map<string, number>();
  for (const r of rows) {
    if (r.clicks <= 0) continue;
    const k = `${r.userId}|${getUtcDayKey(r.callbackAt)}`;
    byUserDay.set(k, (byUserDay.get(k) ?? 0) + r.clicks);
  }
  const out = new Map<number, ZeradsClickTotals>();
  for (const [k, dayClicks] of byUserDay) {
    const userId = Number(k.split("|")[0]);
    const prev = out.get(userId) ?? { raw: 0, credited: 0 };
    prev.raw += dayClicks;
    prev.credited += capZeradsClicksForUtcDay(dayClicks);
    out.set(userId, prev);
  }
  return out;
}
