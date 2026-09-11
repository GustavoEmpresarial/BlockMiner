import { useEffect, useState } from 'react';
import type { Game2048Session } from './game2048.types';

export function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function useRoundSecondsRemaining(session: Game2048Session | null): number {
  const [seconds, setSeconds] = useState(() => Math.max(0, Number(session?.secondsRemaining) || 0));

  useEffect(() => {
    setSeconds(Math.max(0, Number(session?.secondsRemaining) || 0));
    if (!session || String(session.status).toUpperCase() !== 'ACTIVE') return undefined;
    const id = window.setInterval(() => {
      setSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status, session?.secondsRemaining]);

  return seconds;
}
