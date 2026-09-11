import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Shield, Youtube } from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import PowerBoostBanner from '../../shared/components/PowerBoostBanner';
import PausedTimerBanner from '../../shared/components/PausedTimerBanner';
import { usePowerBoostActive } from '../../shared/hooks/usePowerBoostActive';
import { useResumableCountdown } from '../../shared/hooks/useResumableCountdown';
import { generateSecurityPayload } from '../../shared/utils/security';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';
import { formatHashrate } from '../machines/lib/machines.shared';
import { YoutubeVideoPanel } from './components/YoutubeVideoPanel';
import {
  CLAIM_INTERVAL_SEC,
  YoutubeDailyResetBanner,
  YoutubeTrackerSidebar,
  YT_PAUSED_KEY,
  extractVideoId,
  isValidYoutubeVideoId,
  readPausedFlag,
  type PlayerUiState,
} from './components/youtubeWatch.parts';
import {
  DAILY_LIMIT_BACKOFF_MS,
  DEFAULT_MIN_CLAIM_SEC,
  useYoutubePageLease,
  YT_LAST_VIDEO_KEY,
} from './lib/youtubeBackground';
import type { YoutubeStatsPayload, YoutubeStatusPayload } from './lib/youtubeWatch.types';
import { useYoutubeBlurPause } from './lib/useYoutubeBlurPause';
import { useYoutubeIframeApi } from './lib/useYoutubeIframeApi';

type YoutubeStatusResponse = YoutubeStatusPayload & { ok?: boolean };
type YoutubeStatsResponse = YoutubeStatsPayload & {
  ok?: boolean;
  claims24h?: number;
  hashGranted24h?: number;
  dailyLimit?: number;
  dailyRemainingHash?: number;
  activeHashTotal?: number;
  dailyReset?: { localDate?: string; nextResetInMs?: number | null };
  watchSecondsBalance?: number;
  minSecondsToClaim?: number;
  claimsTotal?: number;
  hashGrantedTotal?: number;
};

export default function YouTubeWatchPage() {
  const { t } = useTranslation();
  useYoutubePageLease();
  const powerBoostActive = usePowerBoostActive();
  const { ytApiReady, ytApiFailed } = useYoutubeIframeApi(t);

  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(YT_LAST_VIDEO_KEY);
      return isValidYoutubeVideoId(saved) ? saved : null;
    } catch {
      return null;
    }
  });
  const [playerState, setPlayerState] = useState<PlayerUiState>('idle');
  const playerStateRef = useRef(playerState);
  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  const [status, setStatus] = useState<YoutubeStatusResponse | null>(null);
  const [stats, setStats] = useState<YoutubeStatsResponse | null>(null);
  const claimBusyRef = useRef(false);
  const claimRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claimBlockedUntilRef = useRef(0);
  const heartbeatFailuresRef = useRef(0);

  const [playerReady, setPlayerReady] = useState(false);
  const urlComposingRef = useRef(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const playerDivRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const [playerMountKey, setPlayerMountKey] = useState(0);
  // True for the brief window between "user picked a new video" and the new player's first
  // onReady/onError — playerState is forced to 'idle' during this window (old player destroyed,
  // new one not mounted yet), which would otherwise look identical to "user left/paused" and
  // wrongly trigger the "você pausou / saiu da página" banner (useResumableCountdown's
  // `wasPaused` latch) on every single video switch, not just on real blur/leave.
  const switchingVideoRef = useRef(false);

  const [isPaused, setIsPaused] = useState(() => readPausedFlag(YT_PAUSED_KEY));
  const activelyWatchingRef = useRef(false);
  const isActivelyWatching =
    !isPaused && (playerState === 'playing' || playerState === 'buffering');
  activelyWatchingRef.current = isActivelyWatching;

  const [claimCycleRunning, setClaimCycleRunning] = useState(false);
  // Bumped by resetClaimCycle so useResumableCountdown's "reset to totalSeconds" effect
  // (keyed on cycleId) actually re-fires. Without this, `running` toggling false→true after
  // a claim did NOT reset `remaining` back to 60 — the countdown stayed frozen at 0 forever,
  // and the 1s claim-poll interval (unblocked, since nothing sets claimBlockedUntilRef on a
  // successful claim) fired runClaim() every single second from then on: one real claim, then
  // an unthrottled reward-claim flood. 2026-09-11.
  const [claimCycleId, setClaimCycleId] = useState(0);

  const pauseWatching = useCallback(() => {
    if (activelyWatchingRef.current) {
      try {
        sessionStorage.setItem(YT_PAUSED_KEY, '1');
      } catch {
        /* ignore */
      }
      try {
        ytPlayerRef.current?.pauseVideo();
      } catch {
        /* ignore */
      }
      setIsPaused(true);
    }
  }, []);

  const resumeWatching = useCallback(() => {
    try {
      sessionStorage.removeItem(YT_PAUSED_KEY);
    } catch {
      /* ignore */
    }
    try {
      ytPlayerRef.current?.playVideo();
    } catch {
      /* ignore */
    }
    setIsPaused(false);
  }, []);

  useYoutubeBlurPause({ isPaused, pauseWatching, powerBoostActive, playerStateRef });

  const presenceActive =
    isActivelyWatching || (powerBoostActive && !isPaused && claimCycleRunning);
  const presenceActiveRef = useRef(presenceActive);
  useEffect(() => {
    presenceActiveRef.current = presenceActive;
  }, [presenceActive]);

  const countdown = useResumableCountdown({
    storageKey: 'yt_claim_cycle_timer',
    totalSeconds: CLAIM_INTERVAL_SEC,
    running: claimCycleRunning,
    // While switching videos, claimCycleRunning is already false (via resetClaimCycle), so the
    // ticking interval is already stopped either way — this only controls whether the brief
    // presence loss during the switch wrongly latches the "wasPaused" banner (see
    // switchingVideoRef's comment above).
    paused: !presenceActive && !switchingVideoRef.current,
    cycleId: claimCycleId,
  });

  const resetClaimCycle = useCallback(() => {
    setClaimCycleRunning(false);
    countdown.dismissPaused();
    try {
      sessionStorage.removeItem('yt_claim_cycle_timer');
    } catch {
      /* ignore */
    }
    setClaimCycleRunning(false);
    // Forces useResumableCountdown's reset-to-totalSeconds effect to re-fire — see the
    // claimCycleId declaration above for why this is required (not just clearing storage).
    setClaimCycleId((id) => id + 1);
    // Depend on countdown.dismissPaused (now stable — see useResumableCountdown.ts), NOT the
    // whole `countdown` object: that object gets a new identity every second because
    // `remaining` ticks down every second. Depending on the whole object made resetClaimCycle
    // change identity every second too, which cascaded into the YT.Player-creation effect
    // below (it has resetClaimCycle as a dep) re-running every second — destroying and
    // recreating the live YouTube iframe once per second (the "fica piscando preto" bug,
    // 2026-09-11).
  }, [countdown.dismissPaused]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get<YoutubeStatusResponse>('/youtube/status');
      if (res.data.ok) setStatus(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<YoutubeStatsResponse>('/youtube/stats');
      if (res.data.ok) setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadStats();
  }, [loadStatus, loadStats]);

  const playerStateLabel = useCallback(
    (state: PlayerUiState) => t(`youtube.player_state_${state}`),
    [t],
  );

  const selectAllUrl = useCallback(() => {
    const el = urlInputRef.current;
    if (!el || urlComposingRef.current) return;
    const len = el.value.length;
    if (len === 0) return;
    requestAnimationFrame(() => el.setSelectionRange(0, len));
  }, []);

  const handleClearUrl = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (urlComposingRef.current) return;
      switchingVideoRef.current = false;
      setUrl('');
      setPlayerState('idle');
      resetClaimCycle();
      setPlayerReady(false);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      }
      setVideoId(null);
      setPlayerMountKey((k) => k + 1);
      requestAnimationFrame(() => urlInputRef.current?.focus());
    },
    [resetClaimCycle],
  );

  const handleLoadVideo = useCallback(
    (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const id = extractVideoId(url);
      if (!id) {
        toast.error(t('youtube.invalid_url'));
        return;
      }
      switchingVideoRef.current = true;
      setPlayerState('idle');
      resetClaimCycle();
      setPlayerReady(false);
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      }
      resumeWatching();
      setVideoId(id);
      try {
        localStorage.setItem(YT_LAST_VIDEO_KEY, id);
      } catch {
        /* ignore */
      }
      setPlayerMountKey((k) => k + 1);
      toast.success(t('youtube.video_loaded'));
    },
    [url, t, resetClaimCycle, resumeWatching],
  );

  const handleExternalYoutubeClick = useCallback(() => {
    toast.warning(t('youtube.external_watch_warning'), { duration: 8000 });
  }, [t]);

  useEffect(() => {
    if (!videoId || !playerDivRef.current || !ytApiReady || ytPlayerRef.current) return;

    let cancelled = false;

    try {
      ytPlayerRef.current = new window.YT.Player(playerDivRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            switchingVideoRef.current = false;
            setPlayerReady(true);
            setPlayerState((prev) => {
              if (prev === 'idle') {
                toast.info(t('youtube.click_to_play'), { duration: 4000 });
                return 'cued';
              }
              return prev;
            });
          },
          onError: (event: { data: number }) => {
            if (cancelled) return;
            switchingVideoRef.current = false;
            if (event.data === 101 || event.data === 150) {
              toast.error(t('youtube.video_error_embed'), { duration: 8000 });
            } else {
              toast.error(t('youtube.video_error'), { duration: 5000 });
            }
            setPlayerState('idle');
            setPlayerReady(false);
            resetClaimCycle();
          },
          onStateChange: (event: { data: number }) => {
            // A player destroyed mid-switch (see handleLoadVideo) can still fire one last
            // late state-change event asynchronously — without this guard it would apply to
            // whatever video is now loading, e.g. flipping playerState to 'paused' right as
            // the new video starts, right back into the same false "paused" banner this fix
            // is for.
            if (cancelled) return;
            const YTState = window.YT.PlayerState;
            if (event.data === YTState.PLAYING) {
              setPlayerState('playing');
              // The player itself is ground truth: if it's genuinely playing, the app-level
              // `isPaused` flag must not stay stuck true. Without this, a real pause (tab
              // hidden, blur-away) followed by the user pressing play INSIDE the iframe
              // itself (not the app's "Entendi"/resume button) left `isPaused` latched true
              // forever — isActivelyWatching/presenceActive never recovered, silently
              // freezing the heartbeat (so "Tempo verificado (servidor)" stopped counting)
              // and blocking every future claim, even though the video kept playing fine.
              // 2026-09-11.
              setIsPaused(false);
              try {
                sessionStorage.removeItem(YT_PAUSED_KEY);
              } catch {
                /* ignore */
              }
            } else if (event.data === YTState.BUFFERING) setPlayerState('buffering');
            else if (event.data === YTState.PAUSED) setPlayerState('paused');
            else if (event.data === YTState.ENDED) setPlayerState('ended');
            else if (event.data === YTState.CUED) setPlayerState('cued');
            else setPlayerState('idle');
          },
        },
      });
    } catch {
      switchingVideoRef.current = false;
      toast.error(t('youtube.invalid_url'));
      setVideoId(null);
      setPlayerState('idle');
      setPlayerReady(false);
      resetClaimCycle();
    }

    return () => {
      cancelled = true;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          /* ignore */
        }
        ytPlayerRef.current = null;
      }
    };
  }, [videoId, ytApiReady, playerMountKey, t, resetClaimCycle]);

  const runClaim = useCallback(async () => {
    if (!videoId || claimBusyRef.current) return;
    claimBusyRef.current = true;
    let scheduleRetry = false;
    let retryMs = 0;

    try {
      const res = await api.post<{ ok?: boolean; rewardGh?: number; message?: string }>(
        '/youtube/claim',
        { videoId },
      );
      if (res.data.ok) {
        toast.success(
          t('youtube.claim_applied', { reward: formatHashrate(Number(res.data.rewardGh) || 0) }),
        );
        await loadStatus();
        await loadStats();
        resetClaimCycle();
        if (presenceActiveRef.current || (powerBoostActive && !isPaused)) {
          setClaimCycleRunning(true);
        }
      }
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        const body = err.response.data as { message?: string; retryAfterMs?: number };
        const retryAfter = body?.retryAfterMs;
        if (typeof retryAfter === 'number' && retryAfter > 0) {
          const wait = Math.max(1500, retryAfter);
          claimBlockedUntilRef.current = Date.now() + wait;
          scheduleRetry = true;
          retryMs = wait;
          await loadStats();
        } else {
          const msg = body?.message ?? '';
          const daily = /limite diário|daily limit/i.test(msg);
          toast.error(daily ? t('youtube.daily_limit_reached') : msg || t('youtube.claim_failed'));
          if (daily) {
            setPlayerState('paused');
            resetClaimCycle();
            claimBlockedUntilRef.current = Date.now() + DAILY_LIMIT_BACKOFF_MS;
          }
        }
      } else {
        toast.error(t('youtube.claim_failed'));
        reportApiFailure(
          {
            operation: 'youtube_claim',
            message: isAxiosError(err) ? String(err.response?.data) : 'claim_failed',
            statusCode: isAxiosError(err) ? err.response?.status : undefined,
            context: { videoId },
          },
          err,
        );
        resetClaimCycle();
        if (isAxiosError(err) && err.response?.status === 401) {
          setPlayerState('paused');
        }
      }
    } finally {
      claimBusyRef.current = false;
    }

    if (scheduleRetry) {
      if (claimRetryTimerRef.current) clearTimeout(claimRetryTimerRef.current);
      claimRetryTimerRef.current = setTimeout(() => {
        claimRetryTimerRef.current = null;
        if (presenceActiveRef.current) void runClaim();
      }, retryMs);
    }
  }, [videoId, t, loadStatus, loadStats, resetClaimCycle, powerBoostActive, isPaused]);

  useEffect(() => {
    if (!presenceActive) return undefined;

    const sendHeartbeat = async () => {
      try {
        const security = generateSecurityPayload();
        await api.post('/session/heartbeat', { type: 'youtube', security });
        heartbeatFailuresRef.current = 0;
        await loadStats();
      } catch (err) {
        heartbeatFailuresRef.current += 1;
        if (heartbeatFailuresRef.current === 3) {
          reportApiFailure(
            {
              operation: 'youtube_heartbeat',
              message: err instanceof Error ? err.message : 'heartbeat_failed',
              statusCode: isAxiosError(err) ? err.response?.status : undefined,
              context: { playerState: playerStateRef.current },
            },
            err,
          );
        }
        if (isAxiosError(err) && err.response?.status === 400) {
          const code =
            typeof err.response.data === 'object' && err.response.data !== null
              ? (err.response.data as { code?: string }).code
              : undefined;
          if (code === 'FINGERPRINT_STALE' || code === 'FINGERPRINT_DECODE_FAILED') {
            try {
              const security = generateSecurityPayload();
              await api.post('/session/heartbeat', { type: 'youtube', security });
              await loadStats();
            } catch {
              /* ignore */
            }
          }
        }
      }
    };

    void sendHeartbeat();
    const id = setInterval(() => void sendHeartbeat(), 10_000);
    return () => clearInterval(id);
  }, [presenceActive, loadStats]);

  useEffect(() => {
    return () => {
      if (claimRetryTimerRef.current) clearTimeout(claimRetryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!claimCycleRunning) return undefined;
    const id = setInterval(() => {
      if (!presenceActiveRef.current) return;
      if (claimBusyRef.current || Date.now() < claimBlockedUntilRef.current) return;
      if (countdown.remaining > 0) return;
      void runClaim();
    }, 1000);
    return () => clearInterval(id);
  }, [claimCycleRunning, runClaim, countdown.remaining]);

  useEffect(() => {
    if (isActivelyWatching && !claimCycleRunning) {
      setClaimCycleRunning(true);
    }
  }, [isActivelyWatching, claimCycleRunning]);

  const dailyLimitHash = Number(stats?.dailyLimit ?? 1000);
  const dailyHashUsed = Number(stats?.hashGranted24h ?? 0);
  const dailyHashRemaining = Number(stats?.dailyRemainingHash ?? Math.max(0, dailyLimitHash - dailyHashUsed));
  const activeHashTotal = Number(stats?.activeHashTotal ?? status?.activeHashRate ?? 0);
  const claimsToday = Number(stats?.claims24h ?? 0);
  const dailyProgress = dailyLimitHash > 0 ? (dailyHashUsed / dailyLimitHash) * 100 : 0;
  const minClaimSec = Number(stats?.minSecondsToClaim ?? DEFAULT_MIN_CLAIM_SEC);
  const watchBalance = Number(stats?.watchSecondsBalance ?? 0);
  const dailyReset = stats?.dailyReset ?? null;
  const showClaimCountdown =
    videoId != null && (isActivelyWatching || playerState === 'paused') && claimCycleRunning;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <PowerBoostBanner />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-red-500/10 rounded-2xl">
            <Youtube className="w-6 h-6 text-red-500" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t('youtube.title')}</h1>
          <p className="text-gray-500 font-medium">{t('youtube.subtitle')}</p>
        </div>
        <div className="bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shadow-glow-sm">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-primary font-black text-[10px] uppercase tracking-widest">
            {t('youtube.protocol_active')}
          </span>
        </div>
      </div>

      {dailyReset?.localDate ? (
        <YoutubeDailyResetBanner dailyReset={dailyReset} t={t} onResetElapsed={loadStats} />
      ) : null}

      <PausedTimerBanner
        show={countdown.wasPaused}
        onDismiss={countdown.dismissPaused}
        context="youtube"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <YoutubeVideoPanel
          t={t}
          url={url}
          videoId={videoId}
          playerState={playerState}
          ytApiReady={ytApiReady}
          ytApiFailed={ytApiFailed}
          playerReady={playerReady}
          isPaused={isPaused}
          isActivelyWatching={isActivelyWatching}
          watchBalance={watchBalance}
          minClaimSec={minClaimSec}
          showClaimCountdown={showClaimCountdown}
          countdownRemaining={countdown.remaining}
          urlInputRef={urlInputRef}
          playerDivRef={playerDivRef}
          setUrl={setUrl}
          urlComposingRef={urlComposingRef}
          selectAllUrl={selectAllUrl}
          handleClearUrl={handleClearUrl}
          handleLoadVideo={handleLoadVideo}
          handleExternalYoutubeClick={handleExternalYoutubeClick}
          handleResumeWatching={resumeWatching}
          playerStateLabel={playerStateLabel}
        />
        <YoutubeTrackerSidebar
          t={t}
          showClaimCountdown={showClaimCountdown}
          countdownRemaining={countdown.remaining}
          watchBalance={watchBalance}
          status={status}
          stats={stats}
          dailyHashUsed={dailyHashUsed}
          dailyLimitHash={dailyLimitHash}
          dailyHashRemaining={dailyHashRemaining}
          activeHashTotal={activeHashTotal}
          claimsToday={claimsToday}
          dailyProgress={dailyProgress}
        />
      </div>
    </div>
  );
}
