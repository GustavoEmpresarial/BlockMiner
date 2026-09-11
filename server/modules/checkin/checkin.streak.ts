/**
 * Streak math + live streak for a user.
 *
 * CRITICAL: after grace/freeze, the missed day is NOT inserted. Key-walk alone
 * then under-counts on the next day. Always prefer the persisted `streak` on
 * the latest confirmed row when advancing or showing the live streak.
 */
import {
  addDaysToUtcDayKey,
  getUtcDayKey as getCheckinPeriodKey,
  getUtcPeriodResetAt,
  isSameUtcDay as isSameCheckinPeriod,
  normalizeUtcDayKey,
} from "../../shared/calendar/utcCalendar.js";
import { getCheckinGraceHours } from "./checkin.config.js";

function isPreviousPeriodEndKey(storedKey: string, currentEndKey: string): boolean {
  const stored = normalizeUtcDayKey(storedKey);
  const current = normalizeUtcDayKey(currentEndKey);
  if (!stored || !current) return false;
  const prevEnd = addDaysToUtcDayKey(current, -1);
  return stored === prevEnd;
}

export function isWithinGraceForPeriod(periodEndKey: string, now: Date, graceHours: number): boolean {
  if (graceHours <= 0) return false;
  const graceEndsAt = getUtcPeriodResetAt(periodEndKey).getTime() + graceHours * 3_600_000;
  return now.getTime() <= graceEndsAt;
}

function periodHasConfirmedKey(storedKeys: Iterable<string>, periodEndKey: string): boolean {
  for (const raw of storedKeys) {
    if (isSameCheckinPeriod(raw, periodEndKey)) return true;
  }
  return false;
}

export function computeCheckinStreakFromDateKeys(dateKeys: string[], now = new Date(), graceHours = 6): number {
  const normalizedDates = new Set<string>();
  for (const rawKey of dateKeys || []) {
    const key = normalizeUtcDayKey(rawKey);
    if (key) normalizedDates.add(key);
  }

  const today = getCheckinPeriodKey(now);
  let cursor = today;
  if (!periodHasConfirmedKey(normalizedDates, today)) {
    cursor = addDaysToUtcDayKey(today, -1);
    if (!periodHasConfirmedKey(normalizedDates, cursor)) {
      const graceDay = addDaysToUtcDayKey(today, -1);
      if (
        isWithinGraceForPeriod(graceDay, now, graceHours) &&
        periodHasConfirmedKey(normalizedDates, addDaysToUtcDayKey(today, -2))
      ) {
        cursor = addDaysToUtcDayKey(today, -2);
      } else {
        return 0;
      }
    }
  }

  let streak = 0;
  while (periodHasConfirmedKey(normalizedDates, cursor)) {
    streak += 1;
    cursor = addDaysToUtcDayKey(cursor, -1);
  }
  return streak;
}

export type StreakHistoryRow = {
  checkinDate: string;
  streak: number | null;
};

/**
 * Live streak: prefer persisted streak on the active window (today / yesterday /
 * grace-anchor day). Key-walk alone is wrong after grace without a bridge day.
 */
export function resolveLiveStreakFromRows(
  rows: StreakHistoryRow[],
  now = new Date(),
  graceHours = getCheckinGraceHours(),
): number {
  const byKey = new Map<string, number>();
  const keys: string[] = [];
  for (const row of rows) {
    const key = normalizeUtcDayKey(row.checkinDate);
    if (!key) continue;
    keys.push(key);
    const persisted = Number(row.streak ?? 0);
    if (Number.isFinite(persisted) && persisted > 0) {
      const prev = byKey.get(key) ?? 0;
      if (persisted > prev) byKey.set(key, Math.floor(persisted));
    }
  }

  const today = getCheckinPeriodKey(now);
  const yesterday = addDaysToUtcDayKey(today, -1);
  const graceAnchor = addDaysToUtcDayKey(today, -2);

  const todayStreak = byKey.get(today);
  if (todayStreak && todayStreak > 0) return todayStreak;

  const yesterdayStreak = byKey.get(yesterday);
  if (yesterdayStreak && yesterdayStreak > 0) return yesterdayStreak;

  if (isWithinGraceForPeriod(yesterday, now, graceHours)) {
    const anchor = byKey.get(graceAnchor);
    if (anchor && anchor > 0) return anchor;
  }

  return computeCheckinStreakFromDateKeys(keys, now, graceHours);
}

/** Consecutive confirmed check-in days ending today (or yesterday / grace window). */
export async function computeCheckinStreak(
  userId: number,
  now = new Date(),
  graceHours = getCheckinGraceHours(),
): Promise<number> {
  const { default: prisma } = await import("../../core/database/prisma.js");
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true, streak: true },
  });
  return resolveLiveStreakFromRows(rows, now, graceHours);
}

export type StreakAdvanceInput = {
  userId: number;
  periodKey: string;
  now?: Date;
};

export type StreakAdvanceResult = {
  streakAfter: number;
  usedGrace: boolean;
  usedFreeze: boolean;
};

function streakFromKeyWalk(confirmedKeys: string[], lastKey: string): number {
  let lastStreak = 0;
  let cursor = lastKey;
  const confirmedSet = new Set(confirmedKeys);
  while (confirmedSet.has(cursor)) {
    lastStreak += 1;
    cursor = addDaysToUtcDayKey(cursor, -1);
  }
  return lastStreak;
}

/**
 * Computes streak after a new confirmation for periodKey (does not persist).
 * Uses persisted `streak` on the latest day so grace gaps do not collapse.
 */
export async function computeStreakAfterCheckin(
  input: StreakAdvanceInput,
  deps: {
    countGraceUsesInMonth: (userId: number, monthKey: string) => Promise<number>;
    countFreezeUsesInMonth: (userId: number, monthKey: string) => Promise<number>;
    maxGracePerMonth: number;
    maxFreezePerMonth: number;
    freezeEnabled: boolean;
    graceHours?: number;
  },
): Promise<StreakAdvanceResult> {
  const { default: prisma } = await import("../../core/database/prisma.js");
  const now = input.now ?? new Date();
  const periodKey = normalizeUtcDayKey(input.periodKey) || getCheckinPeriodKey(now);
  const monthKey = periodKey.slice(0, 7);
  const graceHours = deps.graceHours ?? getCheckinGraceHours();

  const rows = await prisma.dailyCheckin.findMany({
    where: { userId: input.userId, status: "confirmed" },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
    select: { checkinDate: true, streak: true },
  });

  return computeStreakAdvanceFromHistory({
    periodKey,
    now,
    history: rows,
    graceHours,
    graceUsesThisMonth: await deps.countGraceUsesInMonth(input.userId, monthKey),
    freezeUsesThisMonth: await deps.countFreezeUsesInMonth(input.userId, monthKey),
    maxGracePerMonth: deps.maxGracePerMonth,
    maxFreezePerMonth: deps.maxFreezePerMonth,
    freezeEnabled: deps.freezeEnabled,
  });
}

/** Pure advance helper for unit tests (no DB) — same lastStreak / grace rules. */
export function computeStreakAdvanceFromHistory(args: {
  periodKey: string;
  now: Date;
  history: StreakHistoryRow[];
  graceHours: number;
  graceUsesThisMonth: number;
  freezeUsesThisMonth: number;
  maxGracePerMonth: number;
  maxFreezePerMonth: number;
  freezeEnabled: boolean;
}): StreakAdvanceResult {
  const periodKey = normalizeUtcDayKey(args.periodKey) || getCheckinPeriodKey(args.now);
  const confirmedKeys = args.history
    .map((r) => normalizeUtcDayKey(r.checkinDate))
    .filter((k): k is string => Boolean(k));
  const lastKey = confirmedKeys.reduce<string | null>((max, k) => (!max || k > max ? k : max), null);
  let lastStreak = 0;
  if (lastKey) {
    const lastRow = args.history.find((r) => normalizeUtcDayKey(r.checkinDate) === lastKey);
    const persisted = Number(lastRow?.streak ?? 0);
    if (Number.isFinite(persisted) && persisted > 0) {
      lastStreak = Math.floor(persisted);
    } else {
      lastStreak = streakFromKeyWalk(confirmedKeys, lastKey);
    }
  }
  const lastKeyStr = lastKey ?? "";
  if (isSameCheckinPeriod(lastKeyStr, periodKey)) {
    return { streakAfter: Math.max(lastStreak, 1), usedGrace: false, usedFreeze: false };
  }
  const yesterday = addDaysToUtcDayKey(periodKey, -1);
  if (isPreviousPeriodEndKey(lastKeyStr, periodKey)) {
    return { streakAfter: lastStreak + 1, usedGrace: false, usedFreeze: false };
  }
  if (isPreviousPeriodEndKey(lastKeyStr, yesterday) && isWithinGraceForPeriod(yesterday, args.now, args.graceHours)) {
    if (args.graceUsesThisMonth < args.maxGracePerMonth) {
      return { streakAfter: lastStreak + 1, usedGrace: true, usedFreeze: false };
    }
  }
  if (args.freezeEnabled && lastKey && isPreviousPeriodEndKey(lastKey, yesterday)) {
    if (args.freezeUsesThisMonth < args.maxFreezePerMonth) {
      return { streakAfter: lastStreak + 1, usedGrace: false, usedFreeze: true };
    }
  }
  return { streakAfter: 1, usedGrace: false, usedFreeze: false };
}
