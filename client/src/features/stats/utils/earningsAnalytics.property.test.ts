import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { deriveDailyDeltas, percentOfTotal } from './earningsAnalytics';
import type { EarningsHistoryPoint } from '../lib/stats.earnings.api';

/** A non-decreasing cumulative series, the real shape GET /stats/earnings returns. */
const cumulativeHistoryArb = fc
  .array(fc.float({ min: 0, max: 100_000, noNaN: true }), { minLength: 0, maxLength: 60 })
  .map((deltas) => {
    let running = 0;
    return deltas.map((d, i) => {
      running += Math.abs(d);
      const date = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
      return { date, total: running, mining: running, offerwall: 0, offerwallInternal: 0, offerwallExternal: 0, faucet: 0, shortlinks: 0, youtube: 0, games: 0, autoMining: 0, checkin: 0, referrals: 0 } as EarningsHistoryPoint;
    });
  });

describe('deriveDailyDeltas — property tests', () => {
  it('never returns a negative total delta for any cumulative (non-decreasing) input', () => {
    fc.assert(
      fc.property(cumulativeHistoryArb, (history) => {
        const deltas = deriveDailyDeltas(history);
        return deltas.every((d) => d.total >= 0);
      }),
    );
  });

  it('never returns a negative per-category delta for any cumulative input', () => {
    fc.assert(
      fc.property(cumulativeHistoryArb, (history) => {
        const deltas = deriveDailyDeltas(history);
        return deltas.every((d) => Object.values(d.byCategory).every((v) => (v ?? 0) >= 0));
      }),
    );
  });

  it('the running sum of deltas never exceeds the final cumulative total (accounting invariant)', () => {
    fc.assert(
      fc.property(cumulativeHistoryArb, (history) => {
        if (history.length === 0) return true;
        const deltas = deriveDailyDeltas(history);
        const sumOfDeltas = deltas.reduce((s, d) => s + d.total, 0);
        const finalCumulative = [...history].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.total;
        // Equal when the series is strictly non-decreasing (our fixture always is);
        // this is the same invariant that "ganho hoje" silently violated before the fix.
        return Math.abs(sumOfDeltas - finalCumulative) < 1e-4;
      }),
    );
  });

  it('is idempotent under re-sorting: shuffling the input array does not change the result', () => {
    fc.assert(
      fc.property(cumulativeHistoryArb, (history) => {
        const shuffled = [...history].reverse();
        return JSON.stringify(deriveDailyDeltas(history)) === JSON.stringify(deriveDailyDeltas(shuffled));
      }),
    );
  });

  it('never throws for arbitrary garbage input (missing fields, wrong types, extreme numbers)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: fc.string(),
            total: fc.oneof(fc.double(), fc.constant(undefined), fc.constant(null), fc.string()),
          }),
          { maxLength: 20 },
        ),
        (garbage) => {
          expect(() => deriveDailyDeltas(garbage as unknown as EarningsHistoryPoint[])).not.toThrow();
          return true;
        },
      ),
    );
  });
});

describe('percentOfTotal — property tests', () => {
  it('always returns a value between 0 and 100 for a value within [0, total]', () => {
    fc.assert(
      fc.property(fc.float({ min: 1, max: 1_000_000, noNaN: true }), fc.float({ min: 0, max: 1, noNaN: true }), (total, fraction) => {
        const value = total * fraction;
        const pct = percentOfTotal(value, total);
        return pct >= 0 && pct <= 100.001; // tiny epsilon for float rounding
      }),
    );
  });

  it('never throws and never returns NaN for arbitrary numeric input, including negatives/NaN/Infinity', () => {
    fc.assert(
      fc.property(fc.double(), fc.double(), (value, total) => {
        const pct = percentOfTotal(value, total);
        return Number.isFinite(pct) || pct === 0;
      }),
    );
  });
});
