import { useEffect, useRef } from 'react';
import { BLUR_PAUSE_GRACE_MS, type PlayerUiState } from '../components/youtubeWatch.parts';

export function useYoutubeBlurPause({
  isPaused,
  pauseWatching,
  powerBoostActive,
  playerStateRef,
}: {
  isPaused: boolean;
  pauseWatching: () => void;
  powerBoostActive: boolean;
  /**
   * Ref (not state — this listener must read the LATEST value without re-subscribing) to the
   * YT.Player's own reported state. Without this, a `window blur` fired by the user simply
   * clicking into the cross-origin YouTube iframe itself (to unmute, seek, go fullscreen —
   * moving focus into that child frame is a classic browser footgun that fires a parent
   * `blur`) would force-pause a video that is still genuinely playing, 8s later, the instant
   * `document.hasFocus()` reports false — which it legitimately can while focus lives inside
   * a trusted child iframe. 2026-09-11: reported as reward-claim countdown getting stuck
   * ("paused" banner while still actively watching).
   */
  playerStateRef: { current: PlayerUiState };
}): void {
  const powerBoostRef = useRef(powerBoostActive);
  useEffect(() => {
    powerBoostRef.current = powerBoostActive;
  }, [powerBoostActive]);

  useEffect(() => {
    if (isPaused) return undefined;

    let leaving = false;
    const markLeaving = () => {
      leaving = true;
    };
    const pauseIfStillHere = () => {
      if (!leaving) pauseWatching();
    };
    const onVisibility = () => {
      if (!powerBoostRef.current && document.hidden) pauseIfStillHere();
    };

    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const clearBlurTimer = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = undefined;
      }
    };
    const onBlur = () => {
      if (powerBoostRef.current) return;
      clearBlurTimer();
      blurTimer = setTimeout(() => {
        blurTimer = undefined;
        // The YouTube iframe is a cross-origin child frame — clicking into it (to unmute,
        // seek, go fullscreen, dismiss an ad) fires a real `blur` on the parent window and
        // `document.hasFocus()` can legitimately report false while focus lives inside that
        // trusted child frame. Trust the player's OWN reported state over document focus: if
        // it says it's still playing, this blur was almost certainly just the iframe taking
        // focus, not the user actually leaving.
        if (playerStateRef.current === 'playing' || playerStateRef.current === 'buffering') return;
        if (!document.hasFocus()) pauseIfStillHere();
      }, BLUR_PAUSE_GRACE_MS);
    };
    const onFocus = () => clearBlurTimer();

    window.addEventListener('beforeunload', markLeaving);
    window.addEventListener('pagehide', markLeaving);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      clearBlurTimer();
      window.removeEventListener('beforeunload', markLeaving);
      window.removeEventListener('pagehide', markLeaving);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      pauseIfStillHere();
    };
  }, [isPaused, pauseWatching, playerStateRef]);
}
