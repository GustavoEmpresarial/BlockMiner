import { useState, useEffect, useCallback, useRef } from "react";
import type { TFunction } from 'i18next';
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { AxiosError } from "axios";
import { Cpu, ShieldCheck, Play, Pause, Loader2, AlertTriangle } from "lucide-react";
import { api, useAuthStore } from "../../shared/auth/auth.store";
import { validateTrustedEvent, generateSecurityPayload } from "../../shared/utils/security";
import PowerBoostBanner from "../../shared/components/PowerBoostBanner";
import AutoMiningCycleTimer from "./components/AutoMiningCycleTimer";
import { reportApiFailure } from "../../shared/utils/reportApiFailure";
import { usePowerBoostActive } from "../../shared/hooks/usePowerBoostActive";
import { AutoMiningDailyResetBanner, AutoMiningSidebar } from "./components/autoMining.parts";
import { useAutoMiningPageLease } from "./lib/autoMiningBackground";
import {
  AUTO_MINING_STALL_REPORT_AFTER_CYCLES,
  adoptLaterNextClaimAt,
  isClaimTargetDue,
  shouldCountAsStalledCycle,
} from "./lib/autoMiningClaimLoop";

/** How long focus must stay away before counting as "the user left". */
const BLUR_PAUSE_GRACE_MS = 8000;

type MiningMode = "NORMAL";

interface DailyResetMeta {
  timezone: string;
  localDate: string;
  nextResetAt: string;
  nextResetInMs: number;
}

interface AutoMiningSession {
  id?: string;
  isActive?: boolean;
  mode?: string;
  nextClaimAt?: string;
}

interface GrantRow {
  id: string;
  earnedAt: string;
  mode: string;
  hashRate: number | string;
}

interface ActiveGrant {
  hashRate: number | string;
  expiresAt: string;
}

interface AutoMiningV2Payload {
  success?: boolean;
  session?: AutoMiningSession | null;
  cycleSeconds?: number;
  dailyReset?: DailyResetMeta;
  dailyUsedHash?: number;
  dailyRemainingHash?: number;
  dailyLimitHash?: number;
  dailyLimitReached?: boolean;
  activeHashTotal?: number;
  sessionEarningsHash?: number;
  activeGrants?: ActiveGrant[];
  recentGrants?: GrantRow[];
  bannerStatsToday?: { impressions: number; clicks: number };
  schemaUnavailable?: boolean;
  /** Present when success is false: why the claim was not granted, and when to try again. */
  code?: string;
  retryAfterMs?: number;
  secondsShort?: number;
}

function errToast(t: TFunction, err: unknown) {
  const ax = err as AxiosError<{ code?: string; error?: string }>;
  const code = ax.response?.data?.code;
  if (code === "SCHEMA_UNAVAILABLE") {
    toast.error(t("autoMiningGpuPage.schema_unavailable_body"));
    return;
  }
  const msg = ax.response?.data?.error ?? (err instanceof Error ? err.message : "");
  if (code) {
    toast.error(t("autoMiningGpuPage.error_code", { code }));
  } else {
    toast.error(msg || t("autoMiningGpuPage.error_network"));
  }
}

export default function AutoMining() {
  const { t } = useTranslation();
  const powerBoostActive = usePowerBoostActive();
  // While this page is mounted IT drives the claim cycle (the 1s poll below);
  // AutoMiningBackgroundRunner must stand down or both would claim the same cycle and one of
  // them would burn a request on a 409 CONCURRENT_CLAIM.
  useAutoMiningPageLease();
  const authHydrated = useAuthStore((s) => s.authHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [v2, setV2] = useState<AutoMiningV2Payload | null>(null);
  const [selectedMode] = useState<MiningMode>("NORMAL");
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  /** Inline reason when a claim is not granted — a toast every second would be unusable. */
  const [claimNotice, setClaimNotice] = useState<string | null>(null);


  const normalClaimBusyRef = useRef(false);
  const nextClaimRef = useRef<string | null>(null);
  const presenceReadyRef = useRef(false);
  /** Consecutive unexpected no-grant replies. CLAIM_NOT_DUE with retryAfterMs is a scheduled
   *  wait, not a stall — counting those flooded admin with "3+ cycles with no grant". */
  const stalledCyclesRef = useRef(0);
  const stallReportedRef = useRef(false);
  const heartbeatFailuresRef = useRef(0);
  /** Mirror of powerBoostActive for interval callbacks (avoids re-subscribing the 1s poll). */
  const powerBoostActiveRef = useRef(false);
  useEffect(() => {
    powerBoostActiveRef.current = powerBoostActive;
  }, [powerBoostActive]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.get<AutoMiningV2Payload>("/auto-mining-gpu/v2/status");
      if (res.data.success) setV2(res.data);
    } catch (err: unknown) {
      console.error("auto-mining v2 status", err);
    }
  }, []);

  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await api.get<AutoMiningV2Payload>("/auto-mining-gpu/v2/status");
        if (cancelled || !res.data.success) return;

        // Reloading the page is a fresh start, not a return from an absence: landing on the
        // "paused, press resume" screen after F5 is confusing. A paused session earns nothing,
        // so it is closed and the user gets the start screen back. Only a real reload does this
        // — coming back from another route must keep the pause, which is the whole point of it.
        const navType = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
        const paused = !!(res.data.session as { pausedAt?: string | null } | undefined)?.pausedAt;
        if (navType === "reload" && res.data.session?.isActive && paused) {
          try {
            const stopped = await api.post<AutoMiningV2Payload>("/auto-mining-gpu/v2/session/stop");
            if (!cancelled && stopped.data.success) {
              setV2(stopped.data);
              return;
            }
          } catch { /* fall through to showing the paused session */ }
        }
        if (!cancelled) setV2(res.data);
      } catch (err: unknown) {
        console.error("auto-mining v2 status", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHydrated, isAuthenticated]);

  const session = v2?.session;
  // Optimistic mirror of the server pause. The POST is fire-and-forget and the payload only
  // refreshes every 45s, so without this the UI kept ticking (claims, heartbeat, countdown) for
  // up to a full poll cycle after the user had already left — which looked like "it never paused".
  const [localPaused, setLocalPaused] = useState(false);
  const serverPaused = !!(session as { pausedAt?: string | null } | undefined)?.pausedAt;
  const isPaused = serverPaused || localPaused;
  /** Mirror of isPaused for interval callbacks (avoids re-subscribing the 1s poll). */
  const isPausedRef = useRef(false);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  // "Running" means actively mining. A paused session is active but frozen, so every claim
  // poll, heartbeat and turbo timer below must stop while it is paused.
  const isRunning = !!(session && session.isActive) && !isPaused;
  // Turbo was retired; sessions are always NORMAL now.
  const mode: MiningMode = "NORMAL";
  const cycleSeconds = v2?.cycleSeconds ?? 60;
  const nextClaimAtIso = session?.nextClaimAt ? new Date(session.nextClaimAt).toISOString() : null;

  useEffect(() => {
    presenceReadyRef.current = false;
    nextClaimRef.current = nextClaimAtIso;
  }, [session?.id]);

  useEffect(() => {
    nextClaimRef.current = adoptLaterNextClaimAt(nextClaimRef.current, nextClaimAtIso);
  }, [nextClaimAtIso]);

  useEffect(() => {
    if (v2?.dailyLimitReached && v2?.session?.isActive) {
      toast.warning(t("autoMiningGpuPage.daily_limit_reached"));
      api.post("/auto-mining-gpu/v2/session/stop").then(() => refreshStatus()).catch(() => refreshStatus());
    }
  }, [v2?.dailyLimitReached, v2?.session?.isActive, t, refreshStatus]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      refreshStatus();
    }, 45000);
    return () => clearInterval(id);
  }, [isRunning, refreshStatus]);

  useEffect(() => {
    if (!isRunning || mode !== "NORMAL") return;
    const id = setInterval(async () => {
      // Without Power Boost, a hidden tab does not claim. With boost paid, keep claiming while
      // this /auto-mining tab stays open (user may switch browser tabs or apps).
      if (document.hidden && !powerBoostActiveRef.current) return;
      if (!presenceReadyRef.current) return;
      const target = nextClaimRef.current;
      if (!target) return;
      if (!isClaimTargetDue(target, Date.now()) || normalClaimBusyRef.current) return;
      normalClaimBusyRef.current = true;
      try {
        const res = await api.post<AutoMiningV2Payload>("/auto-mining-gpu/v2/claim/normal");
        if (res.data.success) {
          stalledCyclesRef.current = 0;
          stallReportedRef.current = false;
          setClaimNotice(null);
          toast.success(t("autoMiningGpuPage.claim_success_normal"));
          setV2(res.data);
          const s = res.data.session;
          if (s?.nextClaimAt) {
            nextClaimRef.current = new Date(s.nextClaimAt).toISOString();
          }
        } else {
          // Benign "not ready" states now arrive as HTTP 200 so the 1s poll no longer floods
          // the console with 400s. Show the real reason inline instead of failing silently.
          const code = res.data.code;
          if (code === "SESSION_PAUSED" || code === "NO_SESSION") {
            // The server thinks the session is frozen (or gone) while this client still shows
            // it running — e.g. the pause POST landed from another tab, or resume failed
            // half-way. Without snapping to server truth the poll hammered SESSION_PAUSED
            // once a second forever while the on-screen timer kept ticking (seen in
            // production 2026-07-22, user at 45.70.73.138). Refresh flips the UI to the
            // paused/start screen and stops this poll via isRunning.
            await refreshStatus();
            return;
          }
          setClaimNotice(
            code === "PRESENCE_STALE" ? t("autoMiningGpuPage.presence_stale")
            : code === "PRESENCE_INSUFFICIENT" ? t("autoMiningGpuPage.presence_insufficient")
            : null,
          );
          const retryAfterMs = res.data.retryAfterMs;
          if (retryAfterMs != null && retryAfterMs > 0) {
            nextClaimRef.current = adoptLaterNextClaimAt(
              nextClaimRef.current,
              new Date(Date.now() + retryAfterMs).toISOString(),
            );
          }

          if (shouldCountAsStalledCycle(code, retryAfterMs)) {
            stalledCyclesRef.current += 1;
            if (stalledCyclesRef.current >= AUTO_MINING_STALL_REPORT_AFTER_CYCLES && !stallReportedRef.current) {
              stallReportedRef.current = true;
              reportApiFailure({
                operation: "auto_mining_stalled",
                message: `3+ cycles with no grant (last code: ${code ?? "none"})`,
                code,
                context: {
                  cycles: stalledCyclesRef.current,
                  secondsShort: res.data.secondsShort,
                  retryAfterMs,
                  isPaused: isPausedRef.current,
                  presenceReady: presenceReadyRef.current,
                  documentHidden: document.hidden,
                  hasFocus: document.hasFocus(),
                  powerBoostActive: powerBoostActiveRef.current,
                  nextClaimAt: nextClaimRef.current,
                },
              });
            }
          }
        }
      } catch (err: unknown) {
        const ax = err as AxiosError<{ code?: string; error?: string }>;
        const code = ax.response?.data?.code;
        if (ax.response?.status === 429) {
          // The claim route allows 12/min while this poll runs every second. Without backing
          // off here a single rejected claim burns the whole budget on 429s, and the user sees
          // a wall of errors instead of mining.
          nextClaimRef.current = new Date(Date.now() + 20_000).toISOString();
        } else if (code === "SESSION_PAUSED" || code === "NO_SESSION") {
          // Client/server desync: the server froze or closed the session while this tab still
          // shows it running. Snap to server truth instead of retrying every second.
          await refreshStatus();
        } else if (code === "DAILY_LIMIT") {
          toast.warning(t("autoMiningGpuPage.daily_limit_reached"));
          try { await api.post("/auto-mining-gpu/v2/session/stop"); } catch { /* non-fatal */ }
          await refreshStatus();
        } else if (
          code &&
          // Benign races, not defects: the poll fires once more after the user stopped the
          // session or while it is frozen. Reporting them buried the real failures.
          !["CLAIM_NOT_DUE", "CONCURRENT_CLAIM", "NO_SESSION", "SESSION_PAUSED", "PRESENCE_STALE", "PRESENCE_INSUFFICIENT"].includes(code)
        ) {
          errToast(t, err);
          reportApiFailure({
            operation: "auto_mining_claim",
            message: ax.response?.data?.error ?? (err instanceof Error ? err.message : "claim_failed"),
            statusCode: ax.response?.status,
            code,
            context: { isPaused: isPausedRef.current, documentHidden: document.hidden, hasFocus: document.hasFocus() },
          }, err);
        } else if (!code) {
          // Timeouts / Cloudflare origin edge are filtered inside reportApiFailure.
          reportApiFailure(
            {
              operation: "auto_mining_claim",
              message: err instanceof Error ? err.message : "claim_failed",
              statusCode: ax.response?.status,
              context: { isPaused: isPausedRef.current, documentHidden: document.hidden, hasFocus: document.hasFocus() },
            },
            err,
          );
        }
      } finally {
        normalClaimBusyRef.current = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, mode, t, refreshStatus]);

  // Presence proof for the claim gate. Without this the server never credits watch seconds.
  useEffect(() => {
    if (!isRunning) {
      presenceReadyRef.current = false;
      return;
    }
    const sendHeartbeat = async () => {
      try {
        const security = generateSecurityPayload();
        await api.post("/session/heartbeat", { type: "auto-mining", security });
        presenceReadyRef.current = true;
        heartbeatFailuresRef.current = 0;
      } catch (err: unknown) {
        // A single dropped beat is normal. Three in a row means presence will go stale and every
        // claim will start failing — the silent root cause behind "nothing is counting".
        heartbeatFailuresRef.current += 1;
        if (heartbeatFailuresRef.current === 3) {
          const ax = err as AxiosError<{ code?: string }>;
          reportApiFailure({
            operation: "auto_mining_heartbeat",
            message: err instanceof Error ? err.message : "heartbeat_failed",
            statusCode: ax.response?.status,
            code: ax.response?.data?.code,
            context: { documentHidden: document.hidden },
          }, err);
        }
      }
    };
    void sendHeartbeat();
    let heartbeatInterval = setInterval(sendHeartbeat, 10000);
    const onVisible = () => {
      if (!document.hidden) {
        clearInterval(heartbeatInterval);
        void sendHeartbeat();
        heartbeatInterval = setInterval(sendHeartbeat, 10000);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isRunning]);

  // Leaving the page or the tab freezes the session server-side. Without this the session stayed
  // "active" while nothing was earned, and the user came back believing it had been mining.
  const sessionActive = !!(session && session.isActive);
  useEffect(() => {
    if (!sessionActive || isPaused) return;
    // A reload is not the user leaving. Chrome fires `visibilitychange` → hidden while tearing
    // the document down, so without this guard pressing F5 paused the session every single time.
    let unloading = false;
    const postPause = () => {
      setLocalPaused(true);
      void api.post("/auto-mining-gpu/v2/session/pause").catch((err: unknown) => {
        const ax = err as AxiosError<{ code?: string }>;
        reportApiFailure({
          operation: "auto_mining_pause",
          message: err instanceof Error ? err.message : "pause_failed",
          statusCode: ax.response?.status,
          code: ax.response?.data?.code,
        }, err);
      });
    };
    // Skip visibility/blur pauses during teardown so F5 is handled by the reload→stop path.
    // pagehide always freezes (the tab — and with it AutoMiningBackgroundRunner — is going
    // away, so nothing would keep claiming); route leave freezes only WITHOUT Power Boost.
    const pauseForFocusLoss = () => {
      if (unloading) return;
      // Power Boost perk: tab/app switch while /auto-mining stays open — do not pause.
      if (powerBoostActiveRef.current) return;
      postPause();
    };
    const onPageHide = () => {
      unloading = true;
      postPause();
    };
    // visibilitychange covers tab switches and minimising, but NOT alt-tabbing to another
    // application while the browser window stays on screen — the tab counts as visible then.
    // `blur` is what catches that.
    const onHidden = () => { if (document.hidden) pauseForFocusLoss(); };
    // Blur alone is far too trigger-happy: ad scripts create iframes and steal focus, so
    // sessions were being paused within SECONDS of starting (measured in production: users
    // 1338, 363 and 878 all paused 7-15s after pressing start, and nothing was ever credited).
    // Two guards: `document.hasFocus()` stays true while focus is merely inside one of our
    // iframes, and a grace delay ignores focus that bounces straight back.
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => { if (blurTimer) { clearTimeout(blurTimer); blurTimer = undefined; } };
    const onBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = undefined;
        if (!document.hasFocus()) pauseForFocusLoss();
      }, BLUR_PAUSE_GRACE_MS);
    };
    const markUnload = () => {
      unloading = true;
    };
    window.addEventListener("beforeunload", markUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      window.removeEventListener("beforeunload", markUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      // Power Boost is exactly the paid privilege of NOT freezing here: AutoMiningBackgroundRunner
      // (mounted app-wide in ProtectedLayout) takes over the claim cycle the moment this lease is
      // released. Pausing on unmount anyway is what silently killed the entitlement — the runner
      // would wake up to a `pausedAt` session and every claim would answer SESSION_PAUSED.
      // Without boost, leaving the route still pauses, unchanged.
      if (!unloading && !powerBoostActiveRef.current) postPause();
    };
    // `powerBoostActive` is deliberately NOT a dependency, and is read through a ref above.
    // It resolves asynchronously (usePowerBoostActive starts false, settles after /boosts/status,
    // repolls every 5min, reacts to POWER_BOOST_CHANGED_EVENT). With it in the deps, activating
    // the boost mid-session re-ran this effect, and the cleanup fired with the STALE `false` and
    // called postPause() — pausing the user at the exact instant they paid. Same defect that had
    // to be fixed in the YouTube presence guard (youtubeWatch.hooks.ts).
  }, [sessionActive, isPaused]);

  const handleResume = async () => {
    setActionBusy(true);
    try {
      const res = await api.post<AutoMiningV2Payload>("/auto-mining-gpu/v2/session/resume");
      if (res.data.success) setV2(res.data);
      else await refreshStatus();
    } catch (err: unknown) {
      errToast(t, err);
      const ax = err as AxiosError<{ code?: string }>;
      reportApiFailure({
        operation: "auto_mining_resume",
        message: err instanceof Error ? err.message : "resume_failed",
        statusCode: ax.response?.status,
        code: ax.response?.data?.code,
      }, err);
    } finally {
      // Cleared unconditionally: if the pause POST never reached the server, the optimistic flag
      // is the only thing still holding the session frozen and the user would be stuck.
      setLocalPaused(false);
      setActionBusy(false);
    }
  };

  const handleStart = async (e: MouseEvent<HTMLButtonElement>) => {
    const trustedOk = validateTrustedEvent(e);
    if (!trustedOk) {
      toast.error(t("autoMiningGpuPage.error_network"));
      return;
    }
    if (v2?.schemaUnavailable) {
      toast.error(t("autoMiningGpuPage.schema_unavailable_body"));
      return;
    }
    setActionBusy(true);
    try {
      const res = await api.post<AutoMiningV2Payload>("/auto-mining-gpu/v2/session/start", { mode: selectedMode });
      if (res.data.success) {
        setLocalPaused(false);
        setV2(res.data);
        toast.success(t("autoMiningGpuPage.toast_started"));
      } else {
        toast.error(t("autoMiningGpuPage.error_network"));
      }
    } catch (err: unknown) {
      errToast(t, err);
    } finally {
      setActionBusy(false);
    }
  };

  const handleStop = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!validateTrustedEvent(e)) return;
    setActionBusy(true);
    try {
      const res = await api.post<AutoMiningV2Payload>("/auto-mining-gpu/v2/session/stop");
      if (res.data.success) {
        setV2(res.data);
        toast.success(t("autoMiningGpuPage.toast_stopped"));
      }
    } catch (err: unknown) {
      errToast(t, err);
    } finally {
      setActionBusy(false);
    }
  };

  const dailyUsed = v2?.dailyUsedHash ?? 0;
  const dailyRemaining = v2?.dailyRemainingHash ?? 0;
  const dailyLimit = v2?.dailyLimitHash ?? 1000;
  const activeHashTotal = v2?.activeHashTotal ?? 0;
  const dailyReset = v2?.dailyReset ?? null;
  const sessionEarnings = v2?.sessionEarningsHash ?? 0;
  const activeGrants = v2?.activeGrants ?? [];
  const recentGrants = v2?.recentGrants ?? [];
  const nearest = activeGrants[0];
  const dailyPct = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0;
  const schemaUnavailable = !!v2?.schemaUnavailable;

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t("autoMiningGpuPage.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <PowerBoostBanner />
      <div className="w-full ">

      </div>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
            <Cpu className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">{t("autoMiningGpuPage.title")}</h1>
          <p className="text-gray-500 font-medium max-w-xl">{t("autoMiningGpuPage.subtitle")}</p>
        </div>
        <div className="bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shadow-glow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">{t("autoMiningGpuPage.secure_badge")}</span>
        </div>
      </div>

      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{t("autoMiningGpuPage.legacy_note")}</p>

      {dailyReset ? <AutoMiningDailyResetBanner dailyReset={dailyReset} t={t} onResetElapsed={refreshStatus} /> : null}

      {schemaUnavailable && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-950/25 px-5 py-4 text-amber-100/90">
          <p className="text-sm font-black uppercase tracking-wide text-amber-400">
            {t("autoMiningGpuPage.schema_unavailable_title")}
          </p>
          <p className="text-xs mt-2 text-amber-200/85 leading-relaxed">
            {t("autoMiningGpuPage.schema_unavailable_body")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-surface border border-gray-800/50 rounded-[3rem] p-8 md:p-10 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 space-y-8">
              {isPaused ? (
                <div className="space-y-6 text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 border-4 border-amber-500/20 flex items-center justify-center">
                    <Pause className="w-10 h-10 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">
                      {t("autoMiningGpuPage.paused_title")}
                    </h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">{t("autoMiningGpuPage.paused_hint")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={actionBusy}
                    className="w-full py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest bg-primary text-white shadow-xl shadow-primary/20 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {actionBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    {t("autoMiningGpuPage.resume_button")}
                  </button>
                </div>
              ) : !isRunning ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">{t("autoMiningGpuPage.mode_title")}</h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">{t("autoMiningGpuPage.normal_only_hint")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={actionBusy || schemaUnavailable}
                    className="w-full md:w-auto px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest bg-primary text-white shadow-xl hover:scale-[1.02] active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {t("autoMiningGpuPage.start")}
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-black text-white uppercase italic">{mode}</h2>
                      </div>
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">{t("autoMiningGpuPage.pause_hint")}</p>
                    </div>
                    <AutoMiningCycleTimer
                      nextClaimAtIso={nextClaimAtIso}
                      cycleSeconds={cycleSeconds}
                      isRunning={isRunning}
                      freezeOnLeave={!powerBoostActive}
                      labelReady={t("autoMiningGpuPage.cycle_ready")}
                      labelNext={t("autoMiningGpuPage.next_cycle")}
                    />
                  </div>

                  {claimNotice ? (
                    <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {claimNotice}
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={actionBusy}
                    className="w-full md:w-auto px-10 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 flex items-center justify-center gap-2"
                  >
                    <Pause className="w-4 h-4" />
                    {t("autoMiningGpuPage.stop")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <AutoMiningSidebar
          t={t}
          dailyUsed={dailyUsed}
          dailyRemaining={dailyRemaining}
          dailyLimit={dailyLimit}
          activeHashTotal={activeHashTotal}
          dailyPct={dailyPct}
          sessionEarnings={sessionEarnings}
          nearest={nearest}
          recentGrants={recentGrants}
        />
      </div>
    </div>
  );
}
