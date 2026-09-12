import { describe, expect, it } from 'vitest';

describe('stats/index barrel', () => {
  it('re-exports StatsPage and the api/config/hooks modules without throwing', async () => {
    const mod = await import('./index');
    expect(mod.StatsPage).toBeDefined();
    expect(mod.fetchPowerStatsEnvelope).toBeTypeOf('function');
    expect(mod.fetchUserEarningsStats).toBeTypeOf('function');
    expect(mod.useUserPowerStats).toBeTypeOf('function');
    expect(mod.STATS_TABS).toBeDefined();
  });
});
