/**
 * Check-in streak anomaly monitor.
 * Detects collapses after grace/freeze and impossible day-to-day streak jumps.
 */
import { logger } from "../../core/logger/index.js";
import { addDaysToUtcDayKey, normalizeUtcDayKey } from "../../shared/calendar/utcCalendar.js";
import {
  getCheckinMonitorLookbackRows,
  isCheckinMonitorEnabled,
} from "./checkin.config.js";

const log = logger.child("checkin.monitor");

export type StreakAnomalyKind =
  | "collapse_after_grace"
  | "collapse_after_freeze"
  | "unexpected_drop_next_day"
  | "impossible_jump";

export type StreakAnomaly = {
  kind: StreakAnomalyKind;
  userId: number;
  prevDate: string;
  nextDate: string;
  prevStreak: number;
  nextStreak: number;
  prevUsedGrace: boolean;
  prevUsedFreeze: boolean;
};

export type MonitorRow = {
  userId: number;
  checkinDate: string;
  streak: number | null;
  usedGrace: boolean;
  usedFreeze: boolean;
};

function dayDiffUtc(a: string, b: string): number | null {
  const na = normalizeUtcDayKey(a);
  const nb = normalizeUtcDayKey(b);
  if (!na || !nb) return null;
  const [ay, am, ad] = na.split("-").map(Number);
  const [by, bm, bd] = nb.split("-").map(Number);
  const ta = Date.UTC(ay!, am! - 1, ad!);
  const tb = Date.UTC(by!, bm! - 1, bd!);
  return Math.round((tb - ta) / 86_400_000);
}

/** Pure scan — unit-testable without DB. */
export function detectStreakAnomalies(rows: MonitorRow[]): StreakAnomaly[] {
  const byUser = new Map<number, MonitorRow[]>();
  for (const row of rows) {
    const key = normalizeUtcDayKey(row.checkinDate);
    if (!key) continue;
    const list = byUser.get(row.userId) ?? [];
    list.push({ ...row, checkinDate: key });
    byUser.set(row.userId, list);
  }

  const anomalies: StreakAnomaly[] = [];
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.checkinDate.localeCompare(b.checkinDate));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const next = list[i]!;
      const prevStreak = Math.floor(Number(prev.streak ?? 0));
      const nextStreak = Math.floor(Number(next.streak ?? 0));
      if (!(prevStreak > 0 && nextStreak > 0)) continue;

      const diff = dayDiffUtc(prev.checkinDate, next.checkinDate);
      if (diff == null || diff <= 0) continue;

      const expectedNext = prevStreak + 1;
      const collapsed = nextStreak < prevStreak && nextStreak <= 2;

      if (diff === 1) {
        if (nextStreak !== expectedNext && collapsed) {
          anomalies.push({
            kind: "unexpected_drop_next_day",
            userId,
            prevDate: prev.checkinDate,
            nextDate: next.checkinDate,
            prevStreak,
            nextStreak,
            prevUsedGrace: prev.usedGrace,
            prevUsedFreeze: prev.usedFreeze,
          });
        } else if (nextStreak > expectedNext + 1) {
          anomalies.push({
            kind: "impossible_jump",
            userId,
            prevDate: prev.checkinDate,
            nextDate: next.checkinDate,
            prevStreak,
            nextStreak,
            prevUsedGrace: prev.usedGrace,
            prevUsedFreeze: prev.usedFreeze,
          });
        }
        continue;
      }

      // Grace/freeze return day is typically prev + 2 calendar days.
      if (diff === 2 && nextStreak !== expectedNext && collapsed) {
        if (next.usedGrace || prev.usedGrace) {
          anomalies.push({
            kind: "collapse_after_grace",
            userId,
            prevDate: prev.checkinDate,
            nextDate: next.checkinDate,
            prevStreak,
            nextStreak,
            prevUsedGrace: Boolean(next.usedGrace || prev.usedGrace),
            prevUsedFreeze: prev.usedFreeze,
          });
        } else if (next.usedFreeze || prev.usedFreeze) {
          anomalies.push({
            kind: "collapse_after_freeze",
            userId,
            prevDate: prev.checkinDate,
            nextDate: next.checkinDate,
            prevStreak,
            nextStreak,
            prevUsedGrace: prev.usedGrace,
            prevUsedFreeze: Boolean(next.usedFreeze || prev.usedFreeze),
          });
        }
      }
    }
  }
  return anomalies;
}

export async function scanRecentStreakAnomalies(lookbackRows?: number): Promise<StreakAnomaly[]> {
  const { default: prisma } = await import("../../core/database/prisma.js");
  const take = lookbackRows ?? getCheckinMonitorLookbackRows();
  const rows = await prisma.dailyCheckin.findMany({
    where: { status: "confirmed" },
    orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
    take,
    select: {
      userId: true,
      checkinDate: true,
      streak: true,
      usedGrace: true,
      usedFreeze: true,
    },
  });
  return detectStreakAnomalies(rows);
}

export async function runCheckinStreakMonitor(): Promise<{ scanned: boolean; anomalyCount: number }> {
  if (!isCheckinMonitorEnabled()) {
    return { scanned: false, anomalyCount: 0 };
  }
  const anomalies = await scanRecentStreakAnomalies();
  for (const a of anomalies) {
    log.error("checkin_streak_anomaly", a);
  }
  if (anomalies.length === 0) {
    log.info("checkin_streak_monitor_ok", { anomalyCount: 0 });
  } else {
    log.warn("checkin_streak_monitor_found", { anomalyCount: anomalies.length });
  }
  return { scanned: true, anomalyCount: anomalies.length };
}

/** Convenience for docs / admin: expected next-day key after a period. */
export function nextUtcDayKey(dayKey: string): string {
  return addDaysToUtcDayKey(normalizeUtcDayKey(dayKey) || dayKey, 1);
}
