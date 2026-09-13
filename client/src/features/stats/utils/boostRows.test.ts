import { describe, expect, it } from 'vitest';
import { collectAllBoostRows, filterBoostRows } from './boostRows';
import type { UserPowerStatsPayload } from '../lib/stats.api';

function basePayload(overrides: Partial<UserPowerStatsPayload> = {}): UserPowerStatsPayload {
  return {
    overview: { nextExpirations: [] },
    youtube: { activeItems: [] },
    games: { minigameTotal: 0, checkinBonusTotal: 0, checkinBonusSlug: '', byGame: [] },
    autoMining: { total: 0, items: [] },
    ...overrides,
  } as unknown as UserPowerStatsPayload;
}

describe('collectAllBoostRows', () => {
  it('returns an empty array when every source is empty/absent', () => {
    expect(collectAllBoostRows(basePayload())).toEqual([]);
  });

  it('does not throw when every optional source is entirely missing from the payload', () => {
    expect(() => collectAllBoostRows({} as UserPowerStatsPayload)).not.toThrow();
    expect(collectAllBoostRows({} as UserPowerStatsPayload)).toEqual([]);
  });

  it('includes overview.nextExpirations rows as-is', () => {
    const rows = collectAllBoostRows(
      basePayload({
        overview: { nextExpirations: [{ source: 'faucet', slug: 'faucet_power', name: 'Faucet', hashRate: 1, expiresAt: '2026-01-01' }] },
      } as never),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'faucet', slug: 'faucet_power' });
  });

  it('maps youtube activeItems into rows with source "youtube"', () => {
    const rows = collectAllBoostRows(
      basePayload({
        youtube: { activeItems: [{ sourceVideoId: 'abc123', hashRate: 5, expiresAt: '2026-02-01' }] },
      } as never),
    );
    expect(rows).toEqual([{ source: 'youtube', slug: 'abc123', name: 'YouTube', hashRate: 5, expiresAt: '2026-02-01' }]);
  });

  it('maps game items, using source "checkin" when the slug contains "checkin"', () => {
    const rows = collectAllBoostRows(
      basePayload({
        games: {
          minigameTotal: 0,
          checkinBonusTotal: 0,
          checkinBonusSlug: '',
          byGame: [
            {
              slug: 'daily-checkin',
              name: 'Check-in',
              totalHashRate: 10,
              items: [{ id: 1, hashRate: 10, expiresAt: '2026-03-01', playedAt: null }],
            },
          ],
        },
      } as never),
    );
    expect(rows).toEqual([{ source: 'checkin', slug: 'daily-checkin', name: 'Check-in', hashRate: 10, expiresAt: '2026-03-01' }]);
  });

  it('maps non-checkin game items with source "game"', () => {
    const rows = collectAllBoostRows(
      basePayload({
        games: {
          minigameTotal: 0,
          checkinBonusTotal: 0,
          checkinBonusSlug: '',
          byGame: [
            {
              slug: 'game2048',
              name: '2048',
              totalHashRate: 3,
              items: [{ id: 2, hashRate: 3, expiresAt: '2026-03-02', playedAt: null }],
            },
          ],
        },
      } as never),
    );
    expect(rows[0].source).toBe('game');
  });

  it('maps autoMining items with a null slug and fixed name/source', () => {
    const rows = collectAllBoostRows(
      basePayload({
        autoMining: { total: 1, items: [{ id: 9, gpuHashRate: 20, expiresAt: '2026-04-01', claimedAt: null }] },
      } as never),
    );
    expect(rows).toEqual([{ source: 'auto_mining', slug: null, name: 'Auto Mining GPU', hashRate: 20, expiresAt: '2026-04-01' }]);
  });

  it('sorts every collected row by expiresAt ascending (string compare)', () => {
    const rows = collectAllBoostRows(
      basePayload({
        overview: { nextExpirations: [{ source: 'faucet', slug: 'f', name: 'Faucet', hashRate: 1, expiresAt: '2026-05-01' }] },
        autoMining: { total: 1, items: [{ id: 1, gpuHashRate: 1, expiresAt: '2026-01-01', claimedAt: null }] },
      } as never),
    );
    expect(rows.map((r) => r.expiresAt)).toEqual(['2026-01-01', '2026-05-01']);
  });
});

describe('filterBoostRows', () => {
  const rows = [
    { source: 'game', slug: 'g1', name: 'Game', hashRate: 1 },
    { source: 'youtube', slug: 'y1', name: 'YouTube', hashRate: 1 },
    { source: 'auto_mining', slug: null, name: 'Auto', hashRate: 1 },
    { source: 'faucet', slug: 'faucet_power', name: 'Faucet', hashRate: 1 },
    { source: 'checkin', slug: 'daily-checkin', name: 'Check-in', hashRate: 1 },
  ] as ReturnType<typeof collectAllBoostRows>;

  it('returns every row for filter "all"', () => {
    expect(filterBoostRows(rows, 'all')).toHaveLength(5);
  });

  it('filters by source "game"', () => {
    expect(filterBoostRows(rows, 'games').map((r) => r.slug)).toEqual(['g1']);
  });

  it('filters by source "youtube"', () => {
    expect(filterBoostRows(rows, 'youtube').map((r) => r.slug)).toEqual(['y1']);
  });

  it('filters autoMining rows by source prefix "auto_mining"', () => {
    expect(filterBoostRows(rows, 'autoMining')).toHaveLength(1);
  });

  it('filters faucet rows by source OR slug match', () => {
    expect(filterBoostRows(rows, 'faucet')).toHaveLength(1);
  });

  it('filters checkin rows by source OR slug containing "checkin"', () => {
    expect(filterBoostRows(rows, 'checkin')).toHaveLength(1);
  });

  it('does not throw when a row has a null slug and the checkin filter is applied', () => {
    const withNullSlug = [{ source: 'auto_mining', slug: null, name: 'Auto', hashRate: 1 }] as ReturnType<
      typeof collectAllBoostRows
    >;
    expect(() => filterBoostRows(withNullSlug, 'checkin')).not.toThrow();
    expect(filterBoostRows(withNullSlug, 'checkin')).toEqual([]);
  });

  it('returns every row for an unrecognized filter value', () => {
    expect(filterBoostRows(rows, 'unknown-filter')).toHaveLength(5);
  });
});
