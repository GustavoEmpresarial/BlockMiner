import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

const updateMiningPayoutMode = vi.fn();
vi.mock('../../lib/stats.api', () => ({ updateMiningPayoutMode: (...args: unknown[]) => updateMiningPayoutMode(...args) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import NetworkTab from './NetworkTab';
import { withProviders, baseContext, basePower } from './testHelpers';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NetworkTab', () => {
  it('renders with a null network/lastBlkCycle without throwing', async () => {
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext()} />));
    });
    expect(await screen.findByText(/ainda não há ciclo/i)).toBeInTheDocument();
  });

  it('renders network rank and BLK pool info when present', async () => {
    const power = basePower({
      network: {
        userRank: 5,
        totalRankedUsers: 100,
        activeUsersLast24h: 20,
        lastBlkCycle: { id: 1, windowStart: '2026-01-01', totalHashrate: 500, minerCount: 10, totalReward: 1, distributed: true },
        blkPoolSharePercent: 12.5,
        rewardPerCycle: 1,
        blkPaused: false,
        activityWindowSec: 60,
      },
    });
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext({ power })} />));
    });
    expect(await screen.findByText('#5')).toBeInTheDocument();
  });

  it('switches payout mode successfully: calls the API, toasts success, and refetches power', async () => {
    const onRefetchPower = vi.fn().mockResolvedValue(undefined);
    updateMiningPayoutMode.mockResolvedValue({ ok: true, mode: 'blk' });
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext({ onRefetchPower })} />));
    });
    const blkButton = screen.getByRole('button', { name: /Minerar BLK/ });
    await act(async () => {
      fireEvent.click(blkButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(updateMiningPayoutMode).toHaveBeenCalledWith('blk');
    expect(toast.success).toHaveBeenCalled();
    expect(onRefetchPower).toHaveBeenCalled();
  });

  it('shows an error toast and does not crash when switching payout mode fails', async () => {
    updateMiningPayoutMode.mockRejectedValue(new Error('fail'));
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext()} />));
    });
    const blkButton = screen.getByRole('button', { name: /Minerar BLK/ });
    await act(async () => {
      fireEvent.click(blkButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(toast.error).toHaveBeenCalled();
  });

  it('does nothing when clicking the button for the already-active mode', async () => {
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext()} />));
    });
    const polButton = screen.getByRole('button', { name: /Minerar POL/ });
    fireEvent.click(polButton);
    expect(updateMiningPayoutMode).not.toHaveBeenCalled();
  });

  it('ignores a second click while a switch is already in flight', async () => {
    let resolvePromise: (v: unknown) => void = () => {};
    updateMiningPayoutMode.mockReturnValue(new Promise((resolve) => (resolvePromise = resolve)));
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext()} />));
    });
    const blkButton = screen.getByRole('button', { name: /Minerar BLK/ });
    fireEvent.click(blkButton);
    fireEvent.click(blkButton);
    await act(async () => {
      resolvePromise({ ok: true, mode: 'blk' });
      await Promise.resolve();
    });
    expect(updateMiningPayoutMode).toHaveBeenCalledTimes(1);
  });

  it('renders payout rows when provided', async () => {
    const power = basePower({ payout: { rows: [{ key: 'r1', labelKey: 'powerStats.payout.title', percent: 50, noteKey: 'powerStats.payout.title' }] } });
    await act(async () => {
      render(withProviders(<NetworkTab {...baseContext({ power })} />));
    });
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });
});
