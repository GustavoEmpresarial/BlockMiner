import { useEffect, useState } from 'react';
import { usePtcSessionStore } from './ptcSession.store';

/** Elapsed viewing seconds for the active PTC session (UI timer). */
export function useActiveViewSeconds(): number {
  const session = usePtcSessionStore((s) => s.session);
  const status = usePtcSessionStore((s) => s.status);
  const accumulatedMs = usePtcSessionStore((s) => s.accumulatedMs);
  const isViewing = usePtcSessionStore((s) => s.isViewing);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== 'viewing' && status !== 'paused') return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  if (!session) return 0;
  const liveMs = isViewing && status === 'viewing' ? 1000 : 0;
  return Math.min((accumulatedMs + liveMs) / 1000, session.requiredSeconds);
}
