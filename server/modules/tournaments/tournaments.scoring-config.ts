import {
  ZERADS_MAX_CLICKS_PER_UTC_DAY,
  aggregateZeradsClicksPerUser,
  capZeradsClicksForUtcDay,
} from "../zerads/index.js";
import { getUtcDayKey } from "../../shared/calendar/utcCalendar.js";
import prisma from "../../core/database/prisma.js";
import { TOURNAMENT_ACTION_PROVIDER } from "./tournaments.providers.js";

export const TOURNAMENT_ZERADS_MAX_PER_WINDOW = ZERADS_MAX_CLICKS_PER_UTC_DAY;
export const ZERADS_SCORING_MODE = "clicks" as const;

export type OffersMetric = "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL";

export type OfferwallSourceKey =
  | "internal"
  | "offerwallMe"
  | "moneyRain"
  | "multiwall"
  | "offerwallGg"
  | "zerads";

export type OfferwallScoreBreakdown = {
  internal: number;
  offerwallMe: number;
  moneyRain: number;
  multiwall: number;
  offerwallGg: number;
  zeradsRaw: number;
  /** Valid Zerads clicks (cap 100/UTC day). */
  zeradsCredited: number;
  zeradsCapped: number;
  total: number;
  /**
   * When the player reached `total` — the time of their last point inside the
   * window. Ties on the leaderboard go to whoever got there first.
   */
  reachedAt: Date | null;
};

export function capZeradsPoints(raw: number): number {
  return capZeradsClicksForUtcDay(raw);
}

export function scoringConfigPayload() {
  return {
    zeradsMode: ZERADS_SCORING_MODE,
    zeradsMaxPerUtcDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    zeradsMaxPerBrtDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    zeradsMaxPerWindow: ZERADS_MAX_CLICKS_PER_UTC_DAY,
  };
}

export function formatUtcWindowLabel(startsAt: Date, endsAt: Date): { start: string; end: string } {
  const fmt = (d: Date) => `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  return { start: fmt(startsAt), end: fmt(endsAt) };
}

/** @deprecated use formatUtcWindowLabel */
export const formatBrtWindowLabel = formatUtcWindowLabel;

const INTERNAL_OFFER_COMPLETED = "COMPLETED";
/** Offerwall.me / Multiwall / Offerwall.GG: 1 = credit, 2 = chargeback. Only credits score. */
const CALLBACK_STATUS_CREDIT = 1;

/** Multiwall / Offerwall.GG score only from this instant — earlier credits are not restored. */
export const MULTIWALL_GG_SCORING_FROM = (() => {
  const fromEnv = new Date(String(process.env.TOURNAMENT_MULTIWALL_GG_SCORING_FROM ?? ""));
  return Number.isNaN(fromEnv.getTime()) ? new Date("2026-10-10T00:00:00.000Z") : fromEnv;
})();

function laterOf(a: Date, b: Date): Date {
  return a > b ? a : b;
}

type SourceEvent = { userId: number; at: Date; points: number };

type Window = { from: Date; to: Date; userId?: number };

type OfferwallSource = {
  key: OfferwallSourceKey;
  provider: string;
  internal: boolean;
  /** Short rule shown to players; points per event are always 1 except Zerads clicks. */
  rule: "per_completion" | "per_credit" | "per_view" | "per_click_daily_cap";
  /** Optional per-source start, for sources that joined the tournament later. */
  scoringFrom?: Date;
  load(w: Window): Promise<SourceEvent[]>;
};

/** Banned accounts never appear on an offerwall leaderboard nor receive its prize. */
const NOT_BANNED = { user: { isBanned: false } } as const;

function byUser(w: Window) {
  return w.userId != null ? { userId: w.userId } : {};
}

/**
 * Every source that scores offerwall tournaments. Adding a provider means one
 * entry here plus its TOURNAMENT_ACTION_PROVIDER value in tournaments.providers.ts;
 * offerwall-sources.test.mjs fails if the two lists drift apart.
 *
 * Windows are half-open [from, to): an event exactly at the end of a daily
 * tournament belongs to the next day, never to both.
 */
export const OFFERWALL_SOURCES: readonly OfferwallSource[] = [
  {
    key: "internal",
    provider: TOURNAMENT_ACTION_PROVIDER.INTERNAL,
    internal: true,
    rule: "per_completion",
    async load(w) {
      const rows = await prisma.internalOfferwallAttempt.findMany({
        where: {
          ...byUser(w),
          ...NOT_BANNED,
          status: INTERNAL_OFFER_COMPLETED,
          completedAt: { gte: w.from, lt: w.to },
        },
        select: { userId: true, completedAt: true },
      });
      return rows.map((r) => ({ userId: r.userId, at: r.completedAt as Date, points: 1 }));
    },
  },
  {
    key: "offerwallMe",
    provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
    internal: false,
    rule: "per_credit",
    async load(w) {
      const rows = await prisma.offerwallMeCallback.findMany({
        where: { ...byUser(w), ...NOT_BANNED, status: CALLBACK_STATUS_CREDIT, createdAt: { gte: w.from, lt: w.to } },
        select: { userId: true, createdAt: true },
      });
      return rows.map((r) => ({ userId: r.userId, at: r.createdAt, points: 1 }));
    },
  },
  {
    key: "moneyRain",
    provider: TOURNAMENT_ACTION_PROVIDER.MONEYRAIN,
    internal: false,
    rule: "per_view",
    async load(w) {
      const rows = await prisma.moneyRainCallback.findMany({
        where: { ...byUser(w), ...NOT_BANNED, createdAt: { gte: w.from, lt: w.to } },
        select: { userId: true, createdAt: true },
      });
      return rows.map((r) => ({ userId: r.userId, at: r.createdAt, points: 1 }));
    },
  },
  {
    key: "multiwall",
    provider: TOURNAMENT_ACTION_PROVIDER.MULTIWALL,
    internal: false,
    rule: "per_credit",
    scoringFrom: MULTIWALL_GG_SCORING_FROM,
    async load(w) {
      const rows = await prisma.multiwallCallback.findMany({
        where: { ...byUser(w), ...NOT_BANNED, status: CALLBACK_STATUS_CREDIT, createdAt: { gte: w.from, lt: w.to } },
        select: { userId: true, createdAt: true },
      });
      return rows.map((r) => ({ userId: r.userId, at: r.createdAt, points: 1 }));
    },
  },
  {
    key: "offerwallGg",
    provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLGG,
    internal: false,
    rule: "per_credit",
    scoringFrom: MULTIWALL_GG_SCORING_FROM,
    async load(w) {
      const rows = await prisma.offerwallGgCallback.findMany({
        where: { ...byUser(w), ...NOT_BANNED, status: CALLBACK_STATUS_CREDIT, createdAt: { gte: w.from, lt: w.to } },
        select: { userId: true, createdAt: true },
      });
      return rows.map((r) => ({ userId: r.userId, at: r.createdAt, points: 1 }));
    },
  },
  {
    key: "zerads",
    provider: TOURNAMENT_ACTION_PROVIDER.ZERADS,
    internal: false,
    rule: "per_click_daily_cap",
    async load(w) {
      const rows = await prisma.zeradsCallback.findMany({
        where: { ...byUser(w), ...NOT_BANNED, callbackAt: { gte: w.from, lt: w.to } },
        select: { userId: true, callbackAt: true, clicks: true },
        orderBy: { callbackAt: "asc" },
      });
      return rows.map((r) => ({ userId: r.userId, at: r.callbackAt, points: r.clicks }));
    },
  },
];

export function sourcesForOffersMetric(metric: OffersMetric): readonly OfferwallSource[] {
  if (metric === "OFFERS_INTERNAL") return OFFERWALL_SOURCES.filter((s) => s.internal);
  if (metric === "OFFERS_EXTERNAL") return OFFERWALL_SOURCES.filter((s) => !s.internal);
  return OFFERWALL_SOURCES;
}

/** Public description of how a given offerwall metric scores, for the tournament page. */
export function offerwallScoringRules(metric: OffersMetric) {
  return {
    zeradsMaxPerUtcDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    tieBreak: "first_to_reach" as const,
    sources: sourcesForOffersMetric(metric).map((s) => ({
      key: s.key,
      rule: s.rule,
      scoringFrom: s.scoringFrom?.toISOString() ?? null,
    })),
  };
}

function emptyBreakdown(): OfferwallScoreBreakdown {
  return {
    internal: 0, offerwallMe: 0, moneyRain: 0, multiwall: 0, offerwallGg: 0,
    zeradsRaw: 0, zeradsCredited: 0, zeradsCapped: 0, total: 0, reachedAt: null,
  };
}

function bump(b: OfferwallScoreBreakdown, key: OfferwallSourceKey, points: number, at: Date): void {
  if (points <= 0) return;
  if (key === "zerads") {
    b.zeradsCredited += points;
    b.zeradsCapped = b.zeradsCredited;
  } else {
    b[key] += points;
  }
  b.total += points;
  if (!b.reachedAt || at > b.reachedAt) b.reachedAt = at;
}

/**
 * Source-of-truth scoring for offerwall tournaments: every point is an event
 * row read straight from the provider tables listed in OFFERWALL_SOURCES.
 * The leaderboard cron and the finalize step both use this, so what players
 * see is exactly what gets paid.
 *
 * `upperBound` is exclusive — pass the tournament's endsAt (or now while live).
 */
export async function computeOfferwallScores(
  startsAt: Date,
  upperBound: Date,
  opts?: {
    userId?: number;
    /** When set, only sources that count for this metric are included. */
    metric?: OffersMetric;
    /** @deprecated prefer `metric` — kept for callers that only toggle internal. */
    includeInternal?: boolean;
  },
): Promise<Map<number, OfferwallScoreBreakdown>> {
  const metric: OffersMetric =
    opts?.metric ?? (opts?.includeInternal === false ? "OFFERS_EXTERNAL" : "OFFERS_ALL");
  const map = new Map<number, OfferwallScoreBreakdown>();
  const entry = (userId: number) => {
    let b = map.get(userId);
    if (!b) {
      b = emptyBreakdown();
      map.set(userId, b);
    }
    return b;
  };

  for (const source of sourcesForOffersMetric(metric)) {
    const from = source.scoringFrom ? laterOf(startsAt, source.scoringFrom) : startsAt;
    if (from >= upperBound) continue;
    const events = await source.load({ from, to: upperBound, userId: opts?.userId });

    if (source.key !== "zerads") {
      for (const e of events) bump(entry(e.userId), source.key, e.points, e.at);
      continue;
    }

    // Zerads: clicks count up to the daily cap per UTC day; clicks past the cap
    // are recorded as raw but add no points (and do not move reachedAt).
    const usedToday = new Map<string, number>();
    for (const e of events) {
      if (e.points <= 0) continue;
      const b = entry(e.userId);
      b.zeradsRaw += e.points;
      const dayKey = `${e.userId}|${getUtcDayKey(e.at)}`;
      const used = usedToday.get(dayKey) ?? 0;
      const credited = Math.min(e.points, Math.max(0, ZERADS_MAX_CLICKS_PER_UTC_DAY - used));
      usedToday.set(dayKey, used + e.points);
      bump(b, "zerads", credited, e.at);
    }
  }

  return map;
}

/** Kept for callers that still aggregate Zerads without timestamps. */
export { aggregateZeradsClicksPerUser };

export async function computeOfferwallScoreForUser(
  userId: number,
  startsAt: Date,
  upperBound: Date,
  includeInternal = true,
): Promise<OfferwallScoreBreakdown> {
  const map = await computeOfferwallScores(startsAt, upperBound, { userId, includeInternal });
  return map.get(userId) ?? emptyBreakdown();
}

/** One player's breakdown for a given offerwall metric (the "your points" panel). */
export async function computeOfferwallBreakdownForUser(
  userId: number,
  metric: OffersMetric,
  startsAt: Date,
  upperBound: Date,
): Promise<OfferwallScoreBreakdown> {
  const map = await computeOfferwallScores(startsAt, upperBound, { userId, metric });
  return map.get(userId) ?? emptyBreakdown();
}
