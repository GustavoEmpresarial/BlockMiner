import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../../../shared/auth/auth.store";
import { generateSecurityPayload } from '../../../shared/utils/security';
import { usePowerBoostActive } from "../../../shared/hooks/usePowerBoostActive";

/**
 * Keeps Auto Mining alive while the user navigates elsewhere in the SPA — but only when
 * today's Power Boost is paid. Without it, leaving /auto-mining pauses the session and this
 * runner stays idle.
 *
 * Mounted once in ProtectedLayout (same pattern as PtcSessionManager).
 */

interface StatusPayload {
  success?: boolean;
  session?: {
    id?: string;
    isActive?: boolean;
    pausedAt?: string | null;
    nextClaimAt?: string;
    mode?: string;
  } | null;
}

const STATUS_POLL_MS = 30_000;
const HEARTBEAT_MS = 10_000;
const CLAIM_POLL_MS = 2_000;

export default function AutoMiningBackgroundRunner() {
  const powerBoostActive = usePowerBoostActive();
  const location = useLocation();
  const onAutoMiningPage = location.pathname === "/auto-mining";

  const sessionActiveRef = useRef(false);
  const nextClaimRef = useRef<string | null>(null);
  const claimBusyRef = useRef(false);

  // Discover / refresh whether an unpaused session exists. Only meaningful with Power Boost:
  // without it the page pauses the session on leave, so there is nothing to keep alive.
  useEffect(() => {
    if (!powerBoostActive || onAutoMiningPage) {
      sessionActiveRef.current = false;
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await api.get<StatusPayload>("/auto-mining-gpu/v2/status");
        if (cancelled || !res.data.success) return;
        const s = res.data.session;
        const active = !!(s?.isActive) && !s?.pausedAt;
        sessionActiveRef.current = active;
        nextClaimRef.current = s?.nextClaimAt ? new Date(s.nextClaimAt).toISOString() : null;
      } catch {
        /* next tick retries */
      }
    };

    void refresh();
    const id = setInterval(refresh, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      sessionActiveRef.current = false;
    };
  }, [powerBoostActive, onAutoMiningPage]);

  // Presence heartbeats while a boosted session is running off-page.
  useEffect(() => {
    if (!powerBoostActive || onAutoMiningPage) return;

    const beat = async () => {
      if (!sessionActiveRef.current) return;
      try {
        const security = generateSecurityPayload();
        await api.post("/session/heartbeat", { type: "auto-mining", security });
      } catch {
        /* page runner / next interval retries */
      }
    };

    void beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [powerBoostActive, onAutoMiningPage]);

  // Claim when the cycle is due.
  useEffect(() => {
    if (!powerBoostActive || onAutoMiningPage) return;

    const tick = async () => {
      if (!sessionActiveRef.current || claimBusyRef.current) return;
      const target = nextClaimRef.current;
      if (!target) return;
      const remain = Math.ceil((new Date(target).getTime() - Date.now()) / 1000);
      if (remain > 0) return;

      claimBusyRef.current = true;
      try {
        const res = await api.post<StatusPayload & { success?: boolean; retryAfterMs?: number }>(
          "/auto-mining-gpu/v2/claim/normal",
        );
        if (res.data.success && res.data.session?.nextClaimAt) {
          nextClaimRef.current = new Date(res.data.session.nextClaimAt).toISOString();
          sessionActiveRef.current = !!(res.data.session.isActive) && !res.data.session.pausedAt;
        } else if (res.data.retryAfterMs != null && res.data.retryAfterMs > 0) {
          nextClaimRef.current = new Date(Date.now() + res.data.retryAfterMs).toISOString();
        }
      } catch {
        nextClaimRef.current = new Date(Date.now() + 15_000).toISOString();
      } finally {
        claimBusyRef.current = false;
      }
    };

    const id = setInterval(tick, CLAIM_POLL_MS);
    return () => clearInterval(id);
  }, [powerBoostActive, onAutoMiningPage]);

  return null;
}
