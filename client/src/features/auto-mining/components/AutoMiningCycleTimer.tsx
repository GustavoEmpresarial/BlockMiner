import { useCallback, useEffect, useRef, useState } from "react";
import PausedTimerBanner from "../../../shared/components/PausedTimerBanner";

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

type AutoMiningCycleTimerProps = {
  nextClaimAtIso: string | null;
  cycleSeconds: number;
  isRunning: boolean;
  labelReady: string;
  labelNext: string;
  /** False under Power Boost: the cycle keeps running off-page (AutoMiningBackgroundRunner), so
   *  freezing the countdown and greeting the user with "paused while you were away" on return
   *  would be a plain lie about what the entitlement they paid for just did. */
  freezeOnLeave?: boolean;
};

const PAUSED_KEY = "am_cycle_paused_state";

interface StoredPausedState {
  remaining: number;
  cycleSeconds: number;
  signature: string | null;
  savedAt: number;
}

const MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Countdown to server-provided nextClaimAt. Updates are skipped while the tab is hidden
 * so background throttling does not desync the UI; on focus the remaining time snaps to server truth.
 *
 * Page-pause behavior: when this component unmounts (user navigates away), the displayed
 * remaining is persisted to sessionStorage and restored on the next mount — the timer
 * visually freezes while the user is on another route and only resumes ticking once they
 * return. The server-side nextClaimAt is still honored when the user resumes (if it has
 * already passed, the timer immediately shows "ready"). A "paused while you were away"
 * banner is shown for a few seconds after restore.
 */
export default function AutoMiningCycleTimer({
  nextClaimAtIso,
  cycleSeconds,
  isRunning,
  labelReady,
  labelNext,
  freezeOnLeave = true,
}: AutoMiningCycleTimerProps) {
  const [remain, setRemain] = useState(cycleSeconds);
  const [wasPaused, setWasPaused] = useState(false);
  const targetMsRef = useRef<number | null>(null);

  const dismissPaused = useCallback(() => setWasPaused(false), []);

  // Restore persisted pause state on mount (or when target changes)
  useEffect(() => {
    if (!nextClaimAtIso || !isRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the countdown when there is no active cycle.
      setRemain(cycleSeconds);
      targetMsRef.current = null;
      return;
    }

    targetMsRef.current = new Date(nextClaimAtIso).getTime();
    const serverRemain = Math.max(0, Math.ceil((targetMsRef.current - Date.now()) / 1000));
    setRemain(serverRemain);

    // If we have saved pause state for THIS cycle, show the "paused while you were away"
    // banner. We always trust server truth for the actual countdown — the banner just
    // tells the user their absence was noted. Saved remaining is honored only when it
    // is greater than server truth (i.e., the user genuinely paused mid-cycle and the
    // server hasn't advanced past where they left off).
    try {
      const raw = sessionStorage.getItem(PAUSED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredPausedState;
        sessionStorage.removeItem(PAUSED_KEY);
        if (
          typeof parsed?.remaining === "number" &&
          typeof parsed?.cycleSeconds === "number" &&
          typeof parsed?.signature === "string" &&
          typeof parsed?.savedAt === "number" &&
          parsed.cycleSeconds === cycleSeconds &&
          parsed.signature === nextClaimAtIso &&
          Date.now() - parsed.savedAt <= MAX_AGE_MS
        ) {
          if (serverRemain > 0) {
            const frozen = Math.max(0, Math.min(serverRemain, Math.floor(parsed.remaining)));
            setRemain(frozen);
          }
          setWasPaused(true);
        }
      }
    } catch {
      /* ignore */
    }
  }, [nextClaimAtIso, isRunning, cycleSeconds]);

  // Tick — pausa quando a aba está oculta
  useEffect(() => {
    if (!nextClaimAtIso || !isRunning) return undefined;

    const tick = () => {
      if (document.hidden) return;
      if (targetMsRef.current == null) return;
      const r = Math.max(0, Math.ceil((targetMsRef.current - Date.now()) / 1000));
      setRemain(r);
    };

    tick();
    const id = setInterval(tick, 500);

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [nextClaimAtIso, isRunning]);

  // Persist on unmount + pagehide: captura o remaining atual (congelado)
  useEffect(() => {
    if (!nextClaimAtIso || !isRunning || !freezeOnLeave) return undefined;

    const save = () => {
      try {
        if (targetMsRef.current == null) return;
        const serverRemain = Math.max(0, Math.ceil((targetMsRef.current - Date.now()) / 1000));
        if (serverRemain <= 0) return; // já pronto — não há nada para "congelar"
        const state: StoredPausedState = {
          remaining: remain,
          cycleSeconds,
          signature: nextClaimAtIso,
          savedAt: Date.now(),
        };
        sessionStorage.setItem(PAUSED_KEY, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
    };
  }, [nextClaimAtIso, isRunning, cycleSeconds, remain, freezeOnLeave]);

  const ready = remain <= 0;
  const total = cycleSeconds;
  const dash = 440;
  const offset = ready ? 0 : dash - (dash * remain) / total;

  return (
    <div className="space-y-3">
      <PausedTimerBanner
        show={wasPaused}
        onDismiss={dismissPaused}
        context="autoMining"
        autoDismissMs={6000}
      />
      <div className="relative w-40 h-40 flex items-center justify-center mx-auto md:mx-0">
        <svg className="w-full h-full -rotate-90" aria-hidden>
          <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-800" />
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-primary transition-all duration-500 ease-linear"
            strokeDasharray={dash}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          <span className="text-3xl font-black text-white italic tabular-nums">{formatTime(remain)}</span>
          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-1 text-center leading-tight">
            {ready ? labelReady : labelNext}
          </span>
        </div>
      </div>
    </div>
  );
}
