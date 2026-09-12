import { describe, expect, it } from 'vitest';
import { STATS_TABS, EARNINGS_CATEGORY_KEYS, earningsFilterToApiPeriod } from './stats.config';

describe('stats.config', () => {
  it('STATS_TABS lists every tab exactly once', () => {
    expect(new Set(STATS_TABS).size).toBe(STATS_TABS.length);
    expect(STATS_TABS).toContain('summary');
  });

  it('EARNINGS_CATEGORY_KEYS lists every category exactly once', () => {
    expect(new Set(EARNINGS_CATEGORY_KEYS).size).toBe(EARNINGS_CATEGORY_KEYS.length);
  });

  it('earningsFilterToApiPeriod is an identity mapping', () => {
    for (const f of ['today', '7d', '30d', '90d', 'all'] as const) {
      expect(earningsFilterToApiPeriod(f)).toBe(f);
    }
  });
});
