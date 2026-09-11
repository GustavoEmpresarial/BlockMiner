import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useYoutubeBlurPause } from './useYoutubeBlurPause';
import { BLUR_PAUSE_GRACE_MS } from '../components/youtubeWatch.parts';

// Regression (2026-09-11): the YouTube iframe is a cross-origin child frame — clicking into
// it (unmute, seek, fullscreen) fires a real `window blur` on the parent, and
// `document.hasFocus()` can legitimately report false while focus lives inside that trusted
// child frame. Reported symptom: the reward-claim countdown got stuck / "paused" while the
// user was still actively watching. Fix: don't force-pause on blur if the player itself still
// reports 'playing'/'buffering'.

function fireBlur() {
  window.dispatchEvent(new Event('blur'));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useYoutubeBlurPause', () => {
  it('does NOT pause on window blur while the player is still reporting "playing" (iframe focus-steal false positive)', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const pauseWatching = vi.fn();
    const playerStateRef = { current: 'playing' as const };

    renderHook(() =>
      useYoutubeBlurPause({ isPaused: false, pauseWatching, powerBoostActive: false, playerStateRef }),
    );

    fireBlur();
    vi.advanceTimersByTime(BLUR_PAUSE_GRACE_MS + 100);

    expect(pauseWatching).not.toHaveBeenCalled();
  });

  it('does NOT pause on window blur while the player is "buffering"', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const pauseWatching = vi.fn();
    const playerStateRef = { current: 'buffering' as const };

    renderHook(() =>
      useYoutubeBlurPause({ isPaused: false, pauseWatching, powerBoostActive: false, playerStateRef }),
    );

    fireBlur();
    vi.advanceTimersByTime(BLUR_PAUSE_GRACE_MS + 100);

    expect(pauseWatching).not.toHaveBeenCalled();
  });

  it('DOES still pause on window blur when the player genuinely is not playing (real away-from-page case)', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const pauseWatching = vi.fn();
    const playerStateRef = { current: 'paused' as const };

    renderHook(() =>
      useYoutubeBlurPause({ isPaused: false, pauseWatching, powerBoostActive: false, playerStateRef }),
    );

    fireBlur();
    vi.advanceTimersByTime(BLUR_PAUSE_GRACE_MS + 100);

    expect(pauseWatching).toHaveBeenCalledTimes(1);
  });

  it('does not pause on blur if focus returns to the parent window before the grace period elapses', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const pauseWatching = vi.fn();
    const playerStateRef = { current: 'paused' as const };

    renderHook(() =>
      useYoutubeBlurPause({ isPaused: false, pauseWatching, powerBoostActive: false, playerStateRef }),
    );

    fireBlur();
    vi.advanceTimersByTime(BLUR_PAUSE_GRACE_MS / 2);
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(BLUR_PAUSE_GRACE_MS);

    expect(pauseWatching).not.toHaveBeenCalled();
  });

  it('never sets up blur/visibility listeners while Power Boost is active', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const pauseWatching = vi.fn();
    const playerStateRef = { current: 'paused' as const };

    renderHook(() =>
      useYoutubeBlurPause({ isPaused: false, pauseWatching, powerBoostActive: true, playerStateRef }),
    );

    fireBlur();
    vi.advanceTimersByTime(BLUR_PAUSE_GRACE_MS + 100);

    expect(pauseWatching).not.toHaveBeenCalled();
  });
});
