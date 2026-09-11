import { useEffect, useSyncExternalStore } from "react";
import { api } from "../auth/auth.store";

interface PowerBoostStatusResponse {
  ok?: boolean;
  active?: boolean;
}

/** Broadcast when the banner activates today's boost so every consumer flips immediately. */
export const POWER_BOOST_CHANGED_EVENT = "blockminer:power-boost-changed";

export function notifyPowerBoostChanged(active: boolean): void {
  try {
    window.dispatchEvent(new CustomEvent(POWER_BOOST_CHANGED_EVENT, { detail: { active } }));
  } catch {
    /* ignore */
  }
}

type Listener = () => void;

let cachedActive = false;
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
const listeners = new Set<Listener>();
const CACHE_TTL_MS = 30_000;

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return cachedActive;
}

async function refreshFromServer(force = false): Promise<void> {
  const now = Date.now();
  if (!force && inFlight) return inFlight;
  if (!force && lastFetchedAt > 0 && now - lastFetchedAt < CACHE_TTL_MS) return;

  inFlight = (async () => {
    try {
      const res = await api.get<PowerBoostStatusResponse>("/power-boost/status");
      const next = res.data?.active === true;
      if (next !== cachedActive) {
        cachedActive = next;
        emit();
      } else {
        cachedActive = next;
      }
      lastFetchedAt = Date.now();
    } catch {
      /* keep last known; default false until first success */
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Whether the user paid today's Power Boost.
 *
 * Shared module cache — all runners/banners share one `/power-boost/status` fetch
 * instead of N parallel requests on ProtectedLayout mount.
 *
 * Starts as `false`, so the pause protection is the default until the server answers.
 */
export function usePowerBoostActive(): boolean {
  const active = useSyncExternalStore(subscribe, getSnapshot, () => false);

  useEffect(() => {
    void refreshFromServer();

    const onChanged = () => {
      // Event is only a "re-check now" hint — never trust forged payload.
      void refreshFromServer(true);
    };
    const onVisible = () => {
      if (!document.hidden) void refreshFromServer();
    };

    window.addEventListener(POWER_BOOST_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => void refreshFromServer(true), 5 * 60_000);

    return () => {
      window.removeEventListener(POWER_BOOST_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, []);

  return active;
}
