import { describe, expect, it, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

import {
  getWalletBalance,
  getMiningCycle,
  postLinkReferral,
  patchMiningAllocation,
  getRoomsSlotsSummary,
  getWithdrawFeeInfo,
  getEnergyTaxSummary,
  getDashboardBanners,
} from './dashboard.api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboard.api', () => {
  it('getWalletBalance calls GET /wallet/balance and returns the response body', async () => {
    api.get.mockResolvedValue({ data: { ok: true, balance: 42 } });
    const res = await getWalletBalance();
    expect(api.get).toHaveBeenCalledWith('/wallet/balance');
    expect(res).toEqual({ ok: true, balance: 42 });
  });

  it('getMiningCycle calls GET /mining/cycle', async () => {
    api.get.mockResolvedValue({ data: { ok: true, blockNumber: 5 } });
    const res = await getMiningCycle();
    expect(api.get).toHaveBeenCalledWith('/mining/cycle');
    expect(res).toEqual({ ok: true, blockNumber: 5 });
  });

  it('postLinkReferral posts the refCode as the body to /user/link-referral', async () => {
    api.post.mockResolvedValue({ data: { ok: true, message: 'linked' } });
    const res = await postLinkReferral('ABC123');
    expect(api.post).toHaveBeenCalledWith('/user/link-referral', { refCode: 'ABC123' });
    expect(res).toEqual({ ok: true, message: 'linked' });
  });

  it('patchMiningAllocation sends polBps as the body to PATCH /mining/allocation', async () => {
    api.patch.mockResolvedValue({ data: { ok: true, polBps: 5000, shibBps: 5000 } });
    const res = await patchMiningAllocation(5000);
    expect(api.patch).toHaveBeenCalledWith('/mining/allocation', { polBps: 5000 });
    expect(res).toEqual({ ok: true, polBps: 5000, shibBps: 5000 });
  });

  it('getRoomsSlotsSummary calls GET /rooms/slots', async () => {
    api.get.mockResolvedValue({ data: { ok: true, freeRacks: 3 } });
    const res = await getRoomsSlotsSummary();
    expect(api.get).toHaveBeenCalledWith('/rooms/slots');
    expect(res).toEqual({ ok: true, freeRacks: 3 });
  });

  it('getWithdrawFeeInfo calls GET /wallet/withdraw-fee-info', async () => {
    api.get.mockResolvedValue({ data: { ok: true, feePercent: 5 } });
    const res = await getWithdrawFeeInfo();
    expect(api.get).toHaveBeenCalledWith('/wallet/withdraw-fee-info');
    expect(res).toEqual({ ok: true, feePercent: 5 });
  });

  it('getEnergyTaxSummary calls GET /energy-tax/summary', async () => {
    api.get.mockResolvedValue({ data: { ok: true, active: true } });
    const res = await getEnergyTaxSummary();
    expect(api.get).toHaveBeenCalledWith('/energy-tax/summary');
    expect(res).toEqual({ ok: true, active: true });
  });

  it('getDashboardBanners calls GET /banners', async () => {
    api.get.mockResolvedValue({ data: { ok: true, banners: [] } });
    const res = await getDashboardBanners();
    expect(api.get).toHaveBeenCalledWith('/banners');
    expect(res).toEqual({ ok: true, banners: [] });
  });

  it('propagates a rejected request instead of swallowing it (callers decide how to log/degrade)', async () => {
    api.get.mockRejectedValue(new Error('network down'));
    await expect(getWalletBalance()).rejects.toThrow('network down');
  });
});
