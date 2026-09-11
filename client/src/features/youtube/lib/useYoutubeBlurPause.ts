import { useEffect, useRef } from 'react';
import { BLUR_PAUSE_GRACE_MS } from '../components/youtubeWatch.parts';

export function useYoutubeBlurPause({
  isPaused,
  pauseWatching,
  powerBoostActive,
}: {
  isPaused: boolean;
  pauseWatching: () => void;
  powerBoostActive: boolean;
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
  }, [isPaused, pauseWatching]);
}
