import { useEffect, useRef } from 'react';
import { api } from '../../../shared/auth/auth.store';
import { usePtcSessionStore } from '../lib/ptcSession.store';

const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Ported for real from legacy/client/src/shared/components/PtcSessionManager.tsx.
 *
 * Real bug fixed 13/08/2026 (PROGRESSO.txt item 76): this whole component was never ported —
 * PtcViewPage/ptc.adCard.tsx (already ported) render a countdown that only advances while
 * `status === 'viewing'`/`'paused'`, but nothing anywhere ever moved the session past
 * `'opening'` or sent a single heartbeat. The backend side (POST /ptc/session/:id/heartbeat +
 * /pause) was already fully ported and working — only this orchestrator, which detects
 * blur/focus (user left to the advertiser's tab) and drives the heartbeat loop, was missing.
 * Effect: the PTC countdown was permanently stuck at 00:00 / requiredSeconds and claim never
 * unlocked, for every user, since the feature shipped in current/ — not a new regression, a
 * gap that was never closed.
 *
 * Mounted once in ProtectedLayout.tsx (authenticated shell), same "app root" placement as
 * legacy, since PTC always requires a session anyway.
 */
export default function PtcSessionManager() {
  const session = usePtcSessionStore((s) => s.session);
  const status = usePtcSessionStore((s) => s.status);
  const isViewing = usePtcSessionStore((s) => s.isViewing);
  const setIsViewing = usePtcSessionStore((s) => s.setIsViewing);
  const setStatus = usePtcSessionStore((s) => s.setStatus);
  const updateAccumulatedMs = usePtcSessionStore((s) => s.updateAccumulatedMs);

  const sessionIdRef = useRef<string | null>(null);
  const isViewingRef = useRef(false);
  const statusRef = useRef(status);

  useEffect(() => { sessionIdRef.current = session?.sessionId ?? null; }, [session]);
  useEffect(() => { isViewingRef.current = isViewing; }, [isViewing]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Detect blur/focus — sets isViewing (user is away from BlockMiner, presumably on the
  // advertiser's tab that window.open() opened when the session started).
  useEffect(() => {
    if (!session || ['completed', 'cancelled', 'claimed', 'idle'].includes(status)) return;

    const isTerminal = () => ['completed', 'cancelled', 'claimed'].includes(statusRef.current);

    const startViewing = () => {
      if (isTerminal()) return;
      setIsViewing(true);
    };

    const stopViewing = () => {
      if (isTerminal()) return;
      setIsViewing(false);
    };

    const onBlur = () => startViewing();
    const onFocus = () => stopViewing();
    const onVisibility = () => {
      if (document.hidden) startViewing();
      else stopViewing();
    };

    // Initialise: if already unfocused when effect runs (e.g. after refresh while ad was open)
    if (!document.hasFocus() || document.hidden) startViewing();

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, status]);

  // Send heartbeat every 10s while user is away (isViewing) — this is what actually advances
  // accumulatedMs server-side and flips status opening -> viewing -> completed.
  useEffect(() => {
    const sid = session?.sessionId;
    if (!sid || !isViewing || ['completed', 'cancelled', 'claimed', 'idle'].includes(status)) return;

    const sendHeartbeat = async () => {
      try {
        const res = await api.post<{ ok: boolean; status: string; accumulatedMs: number }>(
          `/ptc/session/${sid}/heartbeat`,
        );
        if (res.data.ok) {
          updateAccumulatedMs(res.data.accumulatedMs);
          setStatus(res.data.status as Parameters<typeof setStatus>[0]);
        }
      } catch {
        // network errors are non-fatal; heartbeat retries next interval
      }
    };

    void sendHeartbeat();
    const id = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, isViewing, status]);

  // When user returns (isViewing -> false), send pause to server.
  const prevIsViewingRef = useRef(false);
  useEffect(() => {
    const sid = sessionIdRef.current;
    const wasViewing = prevIsViewingRef.current;
    prevIsViewingRef.current = isViewing;

    if (!sid || !wasViewing || isViewing) return;
    if (['completed', 'cancelled', 'claimed', 'idle'].includes(statusRef.current)) return;

    api
      .post<{ ok: boolean; status: string; accumulatedMs: number }>(`/ptc/session/${sid}/pause`)
      .then((res) => {
        if (res.data.ok) {
          updateAccumulatedMs(res.data.accumulatedMs);
          setStatus(res.data.status as Parameters<typeof setStatus>[0]);
        }
      })
      .catch(() => { /* non-fatal */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewing]);

  return null;
}
