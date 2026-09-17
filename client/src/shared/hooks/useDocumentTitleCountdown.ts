import { useEffect, useRef } from 'react';

type DocumentTitleCountdownOpts = {
  remainingSeconds: number;
  isActive: boolean;
  isComplete?: boolean;
  isPaused?: boolean;
  pageName: string;
};

/** Pure title formatter — exported for unit tests. */
export function formatDocumentTitleCountdown(
  pageName: string,
  remainingSeconds: number,
  isComplete: boolean,
  isPaused: boolean,
): string {
  const sec = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
  if (isComplete || sec <= 0) return `✓ · ${pageName}`;
  if (isPaused) return `⏸ ${sec}s · ${pageName}`;
  return `${sec}s · ${pageName}`;
}

/**
 * Shows a live countdown in the browser tab title (right after the favicon).
 * Used by faucet / internal offerwall / PTC while a partner view timer runs.
 */
export function useDocumentTitleCountdown(opts: DocumentTitleCountdownOpts): void {
  const {
    remainingSeconds,
    isActive,
    isComplete = false,
    isPaused = false,
    pageName,
  } = opts;

  const savedTitleRef = useRef<string | null>(null);
  const show = isActive || isComplete;

  useEffect(() => {
    if (!show) {
      if (savedTitleRef.current != null) {
        document.title = savedTitleRef.current;
        savedTitleRef.current = null;
      }
      return;
    }

    if (savedTitleRef.current == null) {
      savedTitleRef.current = document.title;
    }

    document.title = formatDocumentTitleCountdown(
      pageName,
      remainingSeconds,
      isComplete,
      isPaused,
    );
  }, [show, remainingSeconds, isComplete, isPaused, pageName]);

  useEffect(() => {
    return () => {
      if (savedTitleRef.current != null) {
        document.title = savedTitleRef.current;
        savedTitleRef.current = null;
      }
    };
  }, []);
}
