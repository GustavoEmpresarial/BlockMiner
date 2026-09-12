import { describe, expect, it, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

import { fetchPowerStatsEnvelope, updateMiningPayoutMode } from './stats.api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPowerStatsEnvelope', () => {
  it('calls GET /stats/power and returns the response body', async () => {
    api.get.mockResolvedValue({ data: { ok: true, overview: { totalHashrate: 5 } } });
    const res = await fetchPowerStatsEnvelope();
    expect(api.get).toHaveBeenCalledWith('/stats/power');
    expect(res).toEqual({ ok: true, overview: { totalHashrate: 5 } });
  });

  it('propagates a rejection instead of swallowing it', async () => {
    api.get.mockRejectedValue(new Error('down'));
    await expect(fetchPowerStatsEnvelope()).rejects.toThrow('down');
  });
});

describe('updateMiningPayoutMode', () => {
  it('sends the mode as the PATCH body to /mining/payout-mode', async () => {
    api.patch.mockResolvedValue({ data: { ok: true, mode: 'blk' } });
    const res = await updateMiningPayoutMode('blk');
    expect(api.patch).toHaveBeenCalledWith('/mining/payout-mode', { mode: 'blk' });
    expect(res).toEqual({ ok: true, mode: 'blk' });
  });

  it('propagates a rejection instead of swallowing it', async () => {
    api.patch.mockRejectedValue(new Error('down'));
    await expect(updateMiningPayoutMode('pol')).rejects.toThrow('down');
  });
});
