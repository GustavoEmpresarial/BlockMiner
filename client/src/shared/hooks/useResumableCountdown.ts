import { useEffect, useMemo, useState } from 'react';
import { parseStoredTimer, type StoredTimer } from '../../features/shortlinks/lib/shortlinkBackground';

type Options = {
  storageKey: string;
  totalSeconds: number;
  running: boolean;
  paused: boolean;
  signature?: string | null;
  cycleId?: string | number;
  maxAgeMs?: number;
};

function writeTimer(key: string, state: StoredTimer): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function useResumableCountdown({
  storageKey,
  totalSeconds,
  running,
  paused,
  signature = null,
  cycleId,
}: Options) {
  const [remaining, setRemaining] = useState(totalSeconds);

  useEffect(() => {
    setRemaining(totalSeconds);
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = parseStoredTimer(raw);
      if (parsed && parsed.totalSeconds === totalSeconds) {
        if (parsed.signature != null && signature != null && parsed.signature !== signature) {
          sessionStorage.removeItem(storageKey);
        } else {
          const elapsedSec = Math.floor((Date.now() - parsed.savedAt) / 1000);
          setRemaining(Math.max(0, parsed.remaining - elapsedSec));
        }
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, totalSeconds, signature, cycleId]);

  useEffect(() => {
    if (!running || paused) return;
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 1);
        writeTimer(storageKey, {
          remaining: next,
          totalSeconds,
          savedAt: Date.now(),
          signature,
        });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, paused, storageKey, totalSeconds, signature]);

  const [wasPaused, setWasPaused] = useState(false);

  useEffect(() => {
    if (paused) setWasPaused(true);
  }, [paused]);

  return useMemo(
    () => ({
      remaining,
      isComplete: remaining <= 0,
      expired: remaining <= 0,
      wasPaused,
      dismissPaused: () => setWasPaused(false),
    }),
    [remaining, wasPaused],
  );
}
