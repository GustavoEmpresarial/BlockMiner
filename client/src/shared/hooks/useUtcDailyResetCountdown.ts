import { useEffect, useState } from 'react';

export function formatUtcResetCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Countdown toward the next UTC daily reset (server provides remaining ms). */
export function useUtcDailyResetCountdown(initialMs: number | null | undefined): {
  label: string;
  remainingMs: number;
} {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, Number(initialMs) || 0));

  useEffect(() => {
    setRemainingMs(Math.max(0, Number(initialMs) || 0));
  }, [initialMs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemainingMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { label: formatUtcResetCountdown(remainingMs), remainingMs };
}
