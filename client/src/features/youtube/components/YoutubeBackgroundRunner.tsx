import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { generateSecurityPayload } from '../../../shared/utils/security';
import { usePowerBoostActive } from '../../../shared/hooks/usePowerBoostActive';
import {
  ERROR_BACKOFF_MS,
  resolveClaimBackoff,
  useYoutubePageActive,
  YT_LAST_VIDEO_KEY,
} from '../lib/youtubeBackground';
import { CLAIM_INTERVAL_SEC } from './youtubeWatch.parts';
import { formatHashrate } from '../../machines/lib/machines.shared';

/**
 * Keeps YouTube watch session alive while the user navigates elsewhere in the SPA —
 * but only when today's Power Boost is paid. Without it, leaving /youtube pauses the
 * session and this runner stands down.
 *
 * When YouTubeWatchPage is mounted, `useYoutubePageActive()` is true, and this runner
 * stands down so the page component drives its own heartbeat and claim cycles.
 *
 * Mounted once in ProtectedLayout (same pattern as AutoMining and Shortlink runners).
 */
export default function YoutubeBackgroundRunner() {
  const { t } = useTranslation();
  const powerBoostActive = usePowerBoostActive();
  const pageActive = useYoutubePageActive();

  const claimBusyRef = useRef(false);
  const claimBlockedUntilRef = useRef(0);
  const timerKey = 'yt_claim_cycle_timer';

  // 1. Presence heartbeats while boosted and off-page
  useEffect(() => {
    if (!powerBoostActive || pageActive) return undefined;

    let videoId: string | null = null;
    try {
      videoId = localStorage.getItem(YT_LAST_VIDEO_KEY);
    } catch {
      videoId = null;
    }
    if (!videoId) return undefined;

    const beat = async () => {
      // If daily limit was hit, pause heartbeat flood
      if (claimBlockedUntilRef.current > Date.now() + 60_000) return;
      try {
        const security = generateSecurityPayload();
        await api.post('/session/heartbeat', { type: 'youtube', security });
      } catch {
        /* ignore */
      }
    };

    void beat();
    const id = setInterval(beat, 10_000);
    return () => clearInterval(id);
  }, [powerBoostActive, pageActive]);

  // 2. Claim countdown and claim execution while boosted and off-page
  useEffect(() => {
    if (!powerBoostActive || pageActive) return undefined;

    let videoId: string | null = null;
    try {
      videoId = localStorage.getItem(YT_LAST_VIDEO_KEY);
    } catch {
      videoId = null;
    }
    if (!videoId) return undefined;

    let lastTickAt = Date.now();

    const tick = async () => {
      if (claimBusyRef.current || Date.now() < claimBlockedUntilRef.current) {
        lastTickAt = Date.now();
        return;
      }

      const now = Date.now();
      const elapsedSec = Math.max(1, Math.floor((now - lastTickAt) / 1000));
      lastTickAt = now;

      let remaining = CLAIM_INTERVAL_SEC;
      try {
        const raw = sessionStorage.getItem(timerKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { remaining?: number; savedAt?: number };
          if (typeof parsed?.remaining === 'number' && typeof parsed?.savedAt === 'number') {
            const wallDelta = Math.floor((now - parsed.savedAt) / 1000);
            remaining = Math.max(0, parsed.remaining - Math.max(elapsedSec, wallDelta));
          }
        } else {
          remaining = CLAIM_INTERVAL_SEC;
        }
      } catch {
        remaining = CLAIM_INTERVAL_SEC;
      }

      const nextRemaining = Math.max(0, remaining - 1);
      try {
        sessionStorage.setItem(
          timerKey,
          JSON.stringify({
            remaining: nextRemaining,
            totalSeconds: CLAIM_INTERVAL_SEC,
            savedAt: now,
          }),
        );
      } catch {
        /* ignore */
      }

      if (remaining > 0) return;

      // Cycle completed -> trigger claim
      claimBusyRef.current = true;
      try {
        const res = await api.post<{ ok?: boolean; rewardGh?: number; message?: string }>(
          '/youtube/claim',
          { videoId },
        );
        if (res.data?.ok) {
          try {
            sessionStorage.setItem(
              timerKey,
              JSON.stringify({
                remaining: CLAIM_INTERVAL_SEC,
                totalSeconds: CLAIM_INTERVAL_SEC,
                savedAt: Date.now(),
              }),
            );
          } catch {
            /* ignore */
          }
          toast.success(
            t('youtube.claim_applied', {
              reward: formatHashrate(Number(res.data.rewardGh) || 10),
            }),
          );
        }
      } catch (err: unknown) {
        if (isAxiosError(err)) {
          const status = err.response?.status;
          const data = err.response?.data as { message?: string; retryAfterMs?: number } | undefined;
          const retryAfterMs = data?.retryAfterMs;
          const backoff = resolveClaimBackoff(status, retryAfterMs);
          claimBlockedUntilRef.current = Date.now() + backoff.waitMs;
        } else {
          claimBlockedUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
        }
      } finally {
        claimBusyRef.current = false;
      }
    };

    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [powerBoostActive, pageActive, t]);

  return null;
}
