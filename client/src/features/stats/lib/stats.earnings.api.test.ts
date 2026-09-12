import { describe, expect, it, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

import { fetchUserEarningsStats, formatPolAmount } from './stats.earnings.api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('formatPolAmount', () => {
  it('returns "0" for non-finite input instead of "NaN"', () => {
    expect(formatPolAmount(NaN)).toBe('0');
    expect(formatPolAmount(Infinity)).toBe('0');
  });

  it('uses up to 8 decimals below 100', () => {
    expect(formatPolAmount(0.00000001)).toBe('0.00000001');
  });

  it('uses at most 2 decimals at/above 100', () => {
    expect(formatPolAmount(150.123456)).toBe('150.12');
  });
});

describe('fetchUserEarningsStats', () => {
  it('sends the period as a query param and returns the response body', async () => {
    api.get.mockResolvedValue({ data: { ok: true, total: 5 } });
    const res = await fetchUserEarningsStats('30d');
    expect(api.get).toHaveBeenCalledWith('/stats/earnings', { params: { period: '30d' } });
    expect(res).toEqual({ ok: true, total: 5 });
  });

  it('propagates a rejection instead of swallowing it', async () => {
    api.get.mockRejectedValue(new Error('down'));
    await expect(fetchUserEarningsStats('7d')).rejects.toThrow('down');
  });
});
