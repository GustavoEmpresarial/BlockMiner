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

  // Regression (2026-09-11): after a claim/reward fires at remaining=0, YouTubeWatchPage
  // clears sessionStorage and toggles `running` false→true to start a fresh cycle. That alone
  // did NOT reset `remaining` back to totalSeconds — the "reset to totalSeconds" effect is
  // keyed on [storageKey, totalSeconds, signature, cycleId], none of which `running` touches.
  // Result: remaining stayed frozen at 0 forever, and the caller's poll loop (unblocked, since
  // nothing throttles a *successful* claim) fired the reward claim every second — one real
  // claim followed by an unthrottled flood of them.
  it('merely toggling `running` off then on again does NOT reset `remaining` back to totalSeconds once it hit 0 (documents the bug this fix closes)', () => {
    const { result, rerender } = renderHook(
      ({ running }) => useResumableCountdown({ storageKey: 'test_timer_4', totalSeconds: 10, running, paused: false }),
      { initialProps: { running: true } },
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.remaining).toBe(0);

    // Same sequence YouTubeWatchPage's resetClaimCycle used to do: clear storage, stop, restart —
    // but WITHOUT bumping cycleId.
    sessionStorage.removeItem('test_timer_4');
    rerender({ running: false });
    rerender({ running: true });

    expect(result.current.remaining).toBe(0); // still frozen — this is the bug, not a fix.
  });

  it('bumping `cycleId` after clearing storage DOES reset remaining back to totalSeconds (the actual fix)', () => {
    const { result, rerender } = renderHook(
      ({ running, cycleId }) =>
        useResumableCountdown({ storageKey: 'test_timer_5', totalSeconds: 10, running, paused: false, cycleId }),
      { initialProps: { running: true, cycleId: 0 } },
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.remaining).toBe(0);

    sessionStorage.removeItem('test_timer_5');
    rerender({ running: false, cycleId: 1 });
    rerender({ running: true, cycleId: 1 });

    expect(result.current.remaining).toBe(10); // fresh cycle, as intended.

    // And it keeps ticking normally from the fresh start.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remaining).toBe(7);
  });
});
