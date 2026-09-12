import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { EarningsUiFilter } from './stats.config';

const fetchPowerStatsEnvelope = vi.fn();
vi.mock('./stats.api', () => ({ fetchPowerStatsEnvelope: (...args: unknown[]) => fetchPowerStatsEnvelope(...args) }));

const fetchUserEarningsStats = vi.fn();
vi.mock('./stats.earnings.api', () => ({
  fetchUserEarningsStats: (...args: unknown[]) => fetchUserEarningsStats(...args),
}));

import { useUserPowerStats, useUserEarningsStats } from './stats.hooks';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useUserPowerStats', () => {
  it('fetches on mount and exposes the payload on success', async () => {
    fetchPowerStatsEnvelope.mockResolvedValue({ ok: true, overview: { totalHashrate: 1 } });
    const { result } = renderHook(() => useUserPowerStats(0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ ok: true, overview: { totalHashrate: 1 } });
    expect(result.current.error).toBeNull();
  });

  it('sets the error message and does not crash when the envelope resolves with ok:false', async () => {
    fetchPowerStatsEnvelope.mockResolvedValue({ ok: false, message: 'server said no' });
    const { result } = renderHook(() => useUserPowerStats(0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('server said no');
  });

  it('falls back to a generic message when ok:false has no message', async () => {
    fetchPowerStatsEnvelope.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useUserPowerStats(0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load power statistics');
  });

  it('sets an error message and does not crash when the request rejects', async () => {
    fetchPowerStatsEnvelope.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useUserPowerStats(0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('does not poll when pollMs is below the minimum threshold', async () => {
    fetchPowerStatsEnvelope.mockResolvedValue({ ok: true });
    vi.useFakeTimers();
    renderHook(() => useUserPowerStats(1_000)); // below MIN_POLL_MS (5000)
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(1);
  });

  it('polls again after pollMs elapses when pollMs is at/above the minimum', async () => {
    fetchPowerStatsEnvelope.mockResolvedValue({ ok: true });
    vi.useFakeTimers();
    renderHook(() => useUserPowerStats(5_000));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(2);
  });

  it('stops polling after a 401 (session expired) until refetch is called manually', async () => {
    fetchPowerStatsEnvelope.mockRejectedValue(
      Object.assign(new Error('unauthorized'), { isAxiosError: true, response: { status: 401 } }),
    );
    vi.useFakeTimers();
    const { result } = renderHook(() => useUserPowerStats(5_000));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });
    // Still just the one call — polling was disabled by the 401.
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(1);

    fetchPowerStatsEnvelope.mockResolvedValue({ ok: true });
    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('re-enables polling once a manual refetch succeeds after an ok:false response', async () => {
    fetchPowerStatsEnvelope.mockResolvedValueOnce({ ok: false, message: 'temporary' });
    vi.useFakeTimers();
    const { result } = renderHook(() => useUserPowerStats(5_000));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBe('temporary');

    fetchPowerStatsEnvelope.mockResolvedValue({ ok: true });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual({ ok: true });

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(fetchPowerStatsEnvelope).toHaveBeenCalledTimes(3); // initial + refetch + one poll tick
  });
});

describe('useUserEarningsStats', () => {
  it('fetches on mount for the given filter', async () => {
    fetchUserEarningsStats.mockResolvedValue({ ok: true, total: 10 });
    const { result } = renderHook(() => useUserEarningsStats('30d'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchUserEarningsStats).toHaveBeenCalledWith('30d');
    expect(result.current.data).toEqual({ ok: true, total: 10 });
  });

  it('refetches when the filter changes', async () => {
    fetchUserEarningsStats.mockResolvedValue({ ok: true, total: 1 });
    const { rerender } = renderHook(({ filter }) => useUserEarningsStats(filter), {
      initialProps: { filter: '30d' as EarningsUiFilter },
    });
    await waitFor(() => expect(fetchUserEarningsStats).toHaveBeenCalledTimes(1));
    rerender({ filter: '7d' as const });
    await waitFor(() => expect(fetchUserEarningsStats).toHaveBeenCalledTimes(2));
    expect(fetchUserEarningsStats).toHaveBeenLastCalledWith('7d');
  });

  it('sets an error message when the envelope resolves with ok:false', async () => {
    fetchUserEarningsStats.mockResolvedValue({ ok: false, message: 'nope' });
    const { result } = renderHook(() => useUserEarningsStats('30d'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('nope');
    expect(result.current.data).toBeUndefined();
  });

  it('sets an error message when the request rejects', async () => {
    fetchUserEarningsStats.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useUserEarningsStats('30d'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('refetch re-runs the fetch for the current filter', async () => {
    fetchUserEarningsStats.mockResolvedValue({ ok: true, total: 1 });
    const { result } = renderHook(() => useUserEarningsStats('30d'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.refetch();
    });
    expect(fetchUserEarningsStats).toHaveBeenCalledTimes(2);
  });
});
