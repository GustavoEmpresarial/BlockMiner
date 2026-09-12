import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  deriveDailyDeltas,
  computeEarningsInsights,
  percentOfTotal,
  emptyTotals,
  resolveTotals,
} from './earningsAnalytics';
import type { EarningsHistoryPoint, EarningsTotals } from '../lib/stats.earnings.api';

function point(date: string, overrides: Partial<EarningsHistoryPoint> = {}): EarningsHistoryPoint {
  return {
    date,
    total: 0,
    mining: 0,
    offerwall: 0,
    faucet: 0,
    shortlinks: 0,
    autoMining: 0,
    games: 0,
    youtube: 0,
    checkin: 0,
    referrals: 0,
    ...overrides,
  } as EarningsHistoryPoint;
}

describe('deriveDailyDeltas', () => {
  it('returns an empty array for undefined/empty history', () => {
    expect(deriveDailyDeltas(undefined as unknown as EarningsHistoryPoint[])).toEqual([]);
    expect(deriveDailyDeltas([])).toEqual([]);
  });

  it('sorts points by date ascending regardless of input order', () => {
    const result = deriveDailyDeltas([point('2026-03-02', { total: 20 }), point('2026-03-01', { total: 10 })]);
    expect(result.map((r) => r.date)).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('diffs the server\'s CUMULATIVE running total into a per-day delta — the first day is its own value, later days subtract the previous cumulative total', () => {
    // API returns a running total (see stats.earnings.service.ts toCumulativeHistory),
    // e.g. day1=10 (earned 10), day2=25 (earned 15 more), day3=25 (earned nothing more).
    const result = deriveDailyDeltas([
      point('2026-03-01', { total: 10 }),
      point('2026-03-02', { total: 25 }),
      point('2026-03-03', { total: 25 }),
    ]);
    expect(result.map((r) => r.total)).toEqual([10, 15, 0]);
  });

  it('diffs each category independently the same way', () => {
    const result = deriveDailyDeltas([
      point('2026-03-01', { mining: 4, total: 4 }),
      point('2026-03-02', { mining: 9, total: 9 }),
    ]);
    expect(result.map((r) => r.byCategory.mining)).toEqual([4, 5]);
  });

  it('clamps a delta at 0 instead of going negative if the cumulative series ever dips (data correction/float noise)', () => {
    const result = deriveDailyDeltas([
      point('2026-03-01', { total: 10 }),
      point('2026-03-02', { total: 9.9999999 }),
    ]);
    expect(result[1]!.total).toBe(0);
  });

  it('coerces missing/non-numeric total fields to 0 instead of NaN', () => {
    const result = deriveDailyDeltas([point('2026-03-01', { mining: 'oops' as unknown as number, total: undefined as unknown as number })]);
    expect(result[0]!.byCategory.mining).toBe(0);
    expect(result[0]!.total).toBe(0);
  });

  it('carries every known category key even when absent from the source point', () => {
    const result = deriveDailyDeltas([{ date: '2026-03-01' } as EarningsHistoryPoint]);
    expect(Object.keys(result[0]!.byCategory).sort()).toEqual(
      ['autoMining', 'checkin', 'faucet', 'games', 'mining', 'offerwall', 'referrals', 'shortlinks', 'youtube'].sort(),
    );
  });
});

describe('computeEarningsInsights', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const totals: EarningsTotals = {
    total: 100,
    mining: 40,
    offerwall: 30,
    offerwallInternal: 15,
    offerwallExternal: 15,
    faucet: 10,
    shortlinks: 5,
    youtube: 5,
    games: 5,
    autoMining: 3,
    checkin: 1,
    referrals: 1,
  };

  it('returns zeroed today/yesterday and a null bestDay/lastEarning for empty history', () => {
    const insights = computeEarningsInsights(totals, []);
    expect(insights.today).toBe(0);
    expect(insights.yesterday).toBe(0);
    expect(insights.bestDay).toBeNull();
    expect(insights.lastEarning).toBeNull();
    expect(insights.avgDaily).toBe(totals.total); // dayCount clamped to 1
  });

  it('reads today/yesterday as deltas off the cumulative history, not the raw running total', () => {
    // Cumulative: 20 by end of the 9th, 35 by end of the 10th -> earned 20 on the
    // 9th (first tracked day) and 15 more on the 10th, not 35.
    const history = [point('2026-03-09', { total: 20 }), point('2026-03-10', { total: 35 })];
    const insights = computeEarningsInsights(totals, history);
    expect(insights.today).toBe(15);
    expect(insights.yesterday).toBe(20);
  });

  it('picks the highest-DELTA day as bestDay (not the highest cumulative total), ignoring zero-delta days', () => {
    const history = [
      point('2026-03-01', { total: 0 }),
      point('2026-03-05', { total: 50 }), // delta 50 — the actual best day
      point('2026-03-08', { total: 62 }), // cumulative is higher, but delta is only 12
    ];
    const insights = computeEarningsInsights(totals, history);
    expect(insights.bestDay?.date).toBe('2026-03-05');
    expect(insights.bestDay?.total).toBe(50);
  });

  it('picks the category with the highest total as bestSystem', () => {
    const insights = computeEarningsInsights(totals, []);
    expect(insights.bestSystem.key).toBe('mining');
  });

  it('records the most recent date each category had a non-zero credit', () => {
    const history = [
      point('2026-03-01', { mining: 10, total: 10 }),
      point('2026-03-05', { mining: 0, offerwall: 20, total: 20 }),
    ];
    const insights = computeEarningsInsights(totals, history);
    expect(insights.lastCategoryCredit.mining).toBe('2026-03-01');
    expect(insights.lastCategoryCredit.offerwall).toBe('2026-03-05');
    expect(insights.lastCategoryCredit.faucet).toBeUndefined();
  });

  it('finds the most recent day with any earning as lastEarning', () => {
    const history = [point('2026-03-01', { total: 5 }), point('2026-03-02', { total: 0 })];
    const insights = computeEarningsInsights(totals, history);
    expect(insights.lastEarning?.date).toBe('2026-03-01');
  });
});

describe('percentOfTotal', () => {
  it('returns 0 when total is zero, negative, or falsy instead of dividing by zero', () => {
    expect(percentOfTotal(10, 0)).toBe(0);
    expect(percentOfTotal(10, -5)).toBe(0);
    expect(percentOfTotal(10, undefined as unknown as number)).toBe(0);
  });

  it('computes a percentage rounded to one decimal', () => {
    expect(percentOfTotal(33, 100)).toBe(33);
    expect(percentOfTotal(1, 3)).toBe(33.3);
  });
});

describe('emptyTotals / resolveTotals', () => {
  it('emptyTotals zeroes every field', () => {
    const totals = emptyTotals();
    expect(Object.values(totals).every((v) => v === 0)).toBe(true);
  });

  it('resolveTotals returns emptyTotals when earnings is undefined', () => {
    expect(resolveTotals(undefined)).toEqual(emptyTotals());
  });

  it('resolveTotals passes through a real payload unchanged', () => {
    const payload = {
      ...emptyTotals(),
      referralStatsSince: '2026-01-01',
      period: '30d',
      history: [],
      powerMeta: { machineCount: 0, activeBoosts: 0, powerGained24h: 0 },
    } as unknown as Parameters<typeof resolveTotals>[0];
    expect(resolveTotals(payload)).toBe(payload);
  });
});
