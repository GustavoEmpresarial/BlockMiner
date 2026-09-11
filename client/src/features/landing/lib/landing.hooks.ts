import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

// Ported from legacy/client/src/shared/hooks/usePublicStatsPoll.ts +
// legacy/client/src/pages/landing/landing.shared.tsx (useCountUp, useInViewOnce,
// estimateNetworkHashRate, uptimeDays) and legacy/client/src/shared/utils/machine.ts
// (formatHashrate). Kept inside the landing module (not shared/) since nothing
// else in current/client needs them yet — promote to shared/ if that changes.

const STATS_POLL_MS = 30_000;
const STATS_FETCH_MS = 10_000;

export type PublicStatsPayload = {
  ok: true;
  users?: number;
  activeMiners?: number;
  totalWithdrawn?: number;
  launchDate?: string;
};

export function usePublicStatsPoll(): PublicStatsPayload | null {
  const [publicStats, setPublicStats] = useState<PublicStatsPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const loadStats = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const killTimer = window.setTimeout(() => ac.abort(), STATS_FETCH_MS);
    fetch('/api/public-stats', { signal: ac.signal, credentials: 'same-origin' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<PublicStatsPayload>;
        if (!res.ok || !data?.ok) return;
        setPublicStats(data as PublicStatsPayload);
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(killTimer);
        inFlightRef.current = false;
      });
  }, []);

  useEffect(() => {
    loadStats();
    const tick = () => {
      if (document.visibilityState === 'visible') loadStats();
    };
    const id = window.setInterval(tick, STATS_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      abortRef.current?.abort();
    };
  }, [loadStats]);

  return publicStats;
}

const LAUNCH_DATE = new Date('2026-03-05T00:00:00.000Z');
const HS_PER_ACTIVE_RIG = 4000;
const MIN_NETWORK_HS = 800_000;

export function uptimeDays(): number {
  return Math.floor((Date.now() - LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
}

export function estimateNetworkHashRate(publicStats: PublicStatsPayload | null): number {
  const rigs = publicStats?.activeMiners;
  if (typeof rigs === 'number' && rigs > 0) {
    return Math.max(rigs * HS_PER_ACTIVE_RIG, MIN_NETWORK_HS);
  }
  return MIN_NETWORK_HS;
}

export function formatHashrate(value: unknown): string {
  const safeValue = Number(value || 0);
  if (!Number.isFinite(safeValue) || safeValue === 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let scaled = safeValue;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  const precision = scaled >= 100 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
}

export function useInViewOnce(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);
  return [ref, visible];
}

export function useCountUp(end: number, enabled: boolean, decimals = 0): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!enabled || !Number.isFinite(end)) return undefined;
    let start: number | null = null;
    const dur = 1100;
    let raf = 0;
    const tick = (now: number) => {
      if (start == null) start = now;
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - (1 - t) ** 3;
      const next = 0 + (end - 0) * eased;
      setV(decimals > 0 ? Number(next.toFixed(decimals)) : Math.floor(next));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, enabled, decimals]);
  return v;
}

// ─── Public feed ────────────────────────────────────────────────────────────

export type FeedRow = { id: number; user: string; amount: number; at: string };
export type PublicFeed = { withdrawals: FeedRow[]; deposits: FeedRow[] };

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}
