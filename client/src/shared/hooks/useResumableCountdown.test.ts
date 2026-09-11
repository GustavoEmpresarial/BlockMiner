import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResumableCountdown } from './useResumableCountdown';

// Regression (2026-09-11): `dismissPaused` used to be defined inline inside the hook's
// useMemo factory, keyed on [remaining, wasPaused]. Since `remaining` ticks down every
// second, `dismissPaused` got a brand-new function identity every second too — any consumer
// that put it (or the whole countdown object) in a useCallback/useEffect dep array would
// itself re-run every second. In YouTubeWatchPage this cascaded into the YT.Player-creation
// effect destroying and recreating the live iframe once per second ("fica piscando preto").

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useResumableCountdown', () => {
  it('remaining ticks down every second while running (sanity check the clock actually advances)', () => {
    const { result } = renderHook(() =>
      useResumableCountdown({ storageKey: 'test_timer_1', totalSeconds: 10, running: true, paused: false }),
    );
    expect(result.current.remaining).toBe(10);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remaining).toBe(7);
  });

  it('dismissPaused keeps the SAME function identity across ticks, even though `remaining` changes every second', () => {
    const { result } = renderHook(() =>
      useResumableCountdown({ storageKey: 'test_timer_2', totalSeconds: 10, running: true, paused: false }),
    );
    const first = result.current.dismissPaused;
    expect(result.current.remaining).toBe(10);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(9); // confirms a real re-render happened
    expect(result.current.dismissPaused).toBe(first); // but dismissPaused didn't change

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.remaining).toBe(5);
    expect(result.current.dismissPaused).toBe(first);
  });

  it('dismissPaused actually clears wasPaused when called (still functionally correct after stabilizing it)', () => {
    const { result, rerender } = renderHook(
      ({ paused }) => useResumableCountdown({ storageKey: 'test_timer_3', totalSeconds: 10, running: true, paused }),
      { initialProps: { paused: false } },
    );
    rerender({ paused: true });
    expect(result.current.wasPaused).toBe(true);

    act(() => {
      result.current.dismissPaused();
    });
    expect(result.current.wasPaused).toBe(false);
  });
});
