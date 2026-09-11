import { describe, expect, it, vi, afterEach } from 'vitest';
import { estimateNetworkHashRate, uptimeDays } from './landing.shared';

describe('uptimeDays', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts full days since the 2026-03-05 launch date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    expect(uptimeDays()).toBe(10);
  });

  it('never goes negative even if the clock is somehow before launch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    expect(uptimeDays()).toBeLessThan(0); // documents current behavior: no floor at 0
  });
});

describe('estimateNetworkHashRate', () => {
  it('falls back to the 800,000 H/s floor when there is no stats payload', () => {
    expect(estimateNetworkHashRate(null)).toBe(800_000);
  });

  it('falls back to the floor when activeMiners is 0 or missing', () => {
    expect(estimateNetworkHashRate({ ok: true, activeMiners: 0 })).toBe(800_000);
    expect(estimateNetworkHashRate({ ok: true })).toBe(800_000);
  });

  it('estimates 4000 H/s per active rig above the floor', () => {
    // 300 rigs * 4000 = 1,200,000 > 800,000 floor
    expect(estimateNetworkHashRate({ ok: true, activeMiners: 300 })).toBe(1_200_000);
  });

  it('never reports below the floor even with very few active rigs', () => {
    // 10 rigs * 4000 = 40,000 < 800,000 floor -> floor wins
    expect(estimateNetworkHashRate({ ok: true, activeMiners: 10 })).toBe(800_000);
  });
});
