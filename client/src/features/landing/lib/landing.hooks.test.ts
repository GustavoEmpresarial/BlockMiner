import { describe, expect, it } from 'vitest';
import { formatHashrate, timeAgo } from './landing.hooks';

describe('formatHashrate', () => {
  it('returns "0 H/s" for zero, negative, or non-finite input', () => {
    expect(formatHashrate(0)).toBe('0 H/s');
    expect(formatHashrate(undefined)).toBe('0 H/s');
    expect(formatHashrate(Number.NaN)).toBe('0 H/s');
  });

  it('keeps small values in H/s with 2-decimal precision', () => {
    expect(formatHashrate(42)).toBe('42.00 H/s');
  });

  it('scales up through KH/s -> MH/s -> GH/s -> TH/s -> PH/s', () => {
    expect(formatHashrate(1_000)).toBe('1.00 KH/s');
    expect(formatHashrate(1_500_000)).toBe('1.50 MH/s');
    expect(formatHashrate(291_000_000)).toBe('291.0 MH/s'); // >=100 -> 1 decimal, matches the landing page's "291.0 MH/s"
    expect(formatHashrate(2_500_000_000)).toBe('2.50 GH/s');
    expect(formatHashrate(1_000_000_000_000)).toBe('1.00 TH/s');
  });

  it('caps at PH/s and does not scale further', () => {
    expect(formatHashrate(1_000_000_000_000_000_000)).toBe('1000.0 PH/s');
  });
});

describe('timeAgo', () => {
  it('reports "agora" for under a minute', () => {
    expect(timeAgo(new Date(Date.now() - 30_000).toISOString())).toBe('agora');
  });

  it('reports minutes under an hour', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5min atrás');
  });

  it('reports hours under a day', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3h atrás');
  });

  it('reports days at 24h or beyond', () => {
    expect(timeAgo(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2d atrás');
  });
});
