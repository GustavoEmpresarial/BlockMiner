import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePowerBoostActive } from "../../../shared/hooks/usePowerBoostActive";

/**
 * Keeps Shortlink step timers advancing while the user navigates elsewhere in the SPA —
 * only when today's Power Boost is paid.
 *
 * Countdowns live in sessionStorage (`sl_step_N_timer`). Without Power Boost the step page
 * freezes them on unmount; with Power Boost this runner continues wall-clock debit so
 * returning to the step finds the button ready (or a lower remaining count).
 *
 * Mounted once in ProtectedLayout (same pattern as AutoMining / Youtube runners).
 */

const SL_SESSION_KEY = "sl_session";
const SL_PAUSED_KEY = "sl_paused";
const TICK_MS = 1_000;

interface StoredTimer {
  remaining: number;
  totalSeconds: number;
  savedAt: number;
  signature?: string | null;
}

interface StoredSession {
  token?: string;
  currentStep?: number;
}

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed?.currentStep !== "number" || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function timerKey(step: number): string {
  return `sl_step_${step}_timer`;
}

function readTimer(step: number): StoredTimer | null {
  try {
    const raw = sessionStorage.getItem(timerKey(step));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTimer;
    if (
      typeof parsed.remaining !== "number" ||
      typeof parsed.totalSeconds !== "number" ||
      typeof parsed.savedAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeTimer(step: number, state: StoredTimer): void {
  try {
    sessionStorage.setItem(timerKey(step), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function clearPausedFlag(): void {
  try {
    sessionStorage.removeItem(SL_PAUSED_KEY);
  } catch {
    /* ignore */
  }
}

export default function ShortlinkBackgroundRunner() {
  const powerBoostActive = usePowerBoostActive();
  const location = useLocation();
  const onStepPage = /^\/shortlink\/internal-shortlink\/step\//.test(location.pathname);

  useEffect(() => {
    if (!powerBoostActive || onStepPage) return;

    // Boosted user left the step — never show "paused" when they return.
    clearPausedFlag();

    const id = window.setInterval(() => {
      const session = readSession();
      if (!session?.currentStep) return;
      const step = session.currentStep;
      const timer = readTimer(step);
      if (!timer || timer.remaining <= 0) return;

      const now = Date.now();
      const remaining = Math.max(0, timer.remaining - (now - timer.savedAt) / 1000);
      writeTimer(step, {
        remaining,
        totalSeconds: timer.totalSeconds,
        savedAt: now,
        signature: timer.signature ?? null,
      });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [powerBoostActive, onStepPage]);

  return null;
}
