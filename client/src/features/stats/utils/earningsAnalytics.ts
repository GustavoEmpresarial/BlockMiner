import type { EarningsCategoryKey } from '../lib/stats.config';
import type { EarningsHistoryPoint, EarningsTotals, UserEarningsPayload } from '../lib/stats.earnings.api';
import { utcDateKey } from '../../../shared/utils/utcStatsPeriod';

export type DailyEarningsDelta = {
  date: string;
  total: number;
  byCategory: Partial<Record<EarningsCategoryKey, number>>;
};

const EARNINGS_CATEGORY_DELTA_KEYS: EarningsCategoryKey[] = [
  'mining',
  'offerwall',
  'faucet',
  'shortlinks',
  'autoMining',
  'games',
  'youtube',
  'checkin',
  'referrals',
];

/**
 * GET /stats/earnings returns `history` as a RUNNING CUMULATIVE series (see server
 * stats.earnings.service.ts's toCumulativeHistory — intentional, it's what
 * EarningsChartsPanel's "evolução dos ganhos" line chart wants, per its own i18n note
 * "Curva acumulada no período selecionado"). But "today"/"yesterday"/"best day"/
 * "last category credit" are only meaningful as PER-DAY deltas, not lifetime-to-date
 * totals — reading the cumulative total directly used to make "ganho hoje" show the
 * user's entire running total instead of what they actually earned that day, and
 * "melhor dia" always picked the most recent day (cumulative only grows). Diff
 * consecutive cumulative rows here instead of re-deriving the same bug in every caller.
 */
export function deriveDailyDeltas(history: EarningsHistoryPoint[]): DailyEarningsDelta[] {
  const sorted = [...(history || [])].sort((a, b) => a.date.localeCompare(b.date));
  const deltas: DailyEarningsDelta[] = [];
  let prevTotal = 0;
  const prevByCategory: Record<EarningsCategoryKey, number> = Object.fromEntries(
    EARNINGS_CATEGORY_DELTA_KEYS.map((k) => [k, 0]),
  ) as Record<EarningsCategoryKey, number>;

  for (const point of sorted) {
    const cumulativeTotal = Number(point.total) || 0;
    // Clamp at 0: a cumulative series should never decrease, but guards float
    // rounding or a data correction from producing a negative "earned today".
    const total = Math.max(0, Math.round((cumulativeTotal - prevTotal) * 1e8) / 1e8);
    const byCategory: Partial<Record<EarningsCategoryKey, number>> = {};
    for (const key of EARNINGS_CATEGORY_DELTA_KEYS) {
      const cumulativeValue = Number(point[key]) || 0;
      byCategory[key] = Math.max(0, Math.round((cumulativeValue - prevByCategory[key]) * 1e8) / 1e8);
      prevByCategory[key] = cumulativeValue;
    }
    prevTotal = cumulativeTotal;
    deltas.push({ date: point.date, total, byCategory });
  }
  return deltas;
}

function utcYesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateKey(d);
}

export function computeEarningsInsights(
  totals: EarningsTotals,
  history: EarningsHistoryPoint[] | undefined,
) {
  const deltas = deriveDailyDeltas(history || []);
  const todayKey = utcDateKey();
  const yesterdayKey = utcYesterdayKey();

  const todayRow = deltas.find((d) => d.date === todayKey);
  const yesterdayRow = deltas.find((d) => d.date === yesterdayKey);

  const nonZeroDeltas = deltas.filter((d) => d.total > 0);
  const bestDay = nonZeroDeltas.reduce<DailyEarningsDelta | null>(
    (best, row) => (!best || row.total > best.total ? row : best),
    null,
  );

  const dayCount = Math.max(deltas.length, 1);
  const avgDaily = totals.total / dayCount;

  const categoryEntries: Array<{ key: EarningsCategoryKey; value: number }> = [
    { key: 'mining', value: totals.mining },
    { key: 'offerwall', value: totals.offerwall },
    { key: 'faucet', value: totals.faucet },
    { key: 'shortlinks', value: totals.shortlinks },
    { key: 'autoMining', value: totals.autoMining },
    { key: 'games', value: totals.games },
    { key: 'youtube', value: totals.youtube },
    { key: 'checkin', value: totals.checkin },
    { key: 'referrals', value: totals.referrals },
  ];
  const bestSystem = categoryEntries.reduce((a, b) => (b.value > a.value ? b : a));

  const lastCategoryCredit: Partial<Record<EarningsCategoryKey, string>> = {};
  for (const key of categoryEntries.map((c) => c.key)) {
    for (let i = deltas.length - 1; i >= 0; i -= 1) {
      const row = deltas[i]!;
      const amt = row.byCategory[key] ?? 0;
      if (amt > 0) {
        lastCategoryCredit[key] = row.date;
        break;
      }
    }
  }

  const lastEarning = [...deltas].reverse().find((d) => d.total > 0) ?? null;

  return {
    today: todayRow?.total ?? 0,
    yesterday: yesterdayRow?.total ?? 0,
    avgDaily,
    bestDay,
    lastEarning,
    bestSystem,
    lastCategoryCredit,
    deltas,
  };
}

/**
 * Found by fast-check property testing: `total` being a denormalized-but-positive
 * float (e.g. 5e-324) slipped past the old `total <= 0` guard and produced
 * Infinity/-Infinity (division by a value effectively zero but not caught by the
 * check). `total` is always a real POL/BLK/SHIB earnings sum in practice, never
 * that pathological, but the function is defensive-coded anyway rather than
 * trusting every future caller to only pass sane values.
 */
export function percentOfTotal(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  const pct = Math.round((value / total) * 1000) / 10;
  return Number.isFinite(pct) ? pct : 0;
}

export function emptyTotals(): EarningsTotals {
  return {
    total: 0,
    mining: 0,
    offerwall: 0,
    offerwallInternal: 0,
    offerwallExternal: 0,
    faucet: 0,
    shortlinks: 0,
    youtube: 0,
    games: 0,
    autoMining: 0,
    checkin: 0,
    referrals: 0,
  };
}

export function resolveTotals(earnings: UserEarningsPayload | undefined): EarningsTotals {
  if (!earnings) return emptyTotals();
  return earnings;
}
