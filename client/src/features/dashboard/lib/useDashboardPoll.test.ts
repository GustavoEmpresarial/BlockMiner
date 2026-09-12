import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardPoll } from './useDashboardPoll';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDashboardPoll', () => {
  it('runs the fetcher immediately on mount, then again on each interval tick', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useDashboardPoll(fetcher, 1000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(fetcher).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(2000));
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('re-runs the fetcher when the tab becomes visible again', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useDashboardPoll(fetcher, 60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not re-run the fetcher when visibilitychange fires while the tab is still hidden', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useDashboardPoll(fetcher, 60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetcher).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('re-runs the fetcher on window focus', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useDashboardPoll(fetcher, 60_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops polling and removes listeners on unmount (no calls after cleanup)', () => {
    const fetcher = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useDashboardPoll(fetcher, 1000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
