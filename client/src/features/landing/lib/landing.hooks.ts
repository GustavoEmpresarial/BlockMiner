// Ported from legacy/client/src/shared/hooks/usePublicStatsPoll.ts +
// legacy/client/src/pages/landing/landing.shared.tsx and
// legacy/client/src/shared/utils/machine.ts (formatHashrate).
//
// RECOVERED-adjacent cleanup (2026-09-11): this file used to duplicate
// usePublicStatsPoll/uptimeDays/estimateNetworkHashRate/useInViewOnce/useCountUp
// verbatim from landing.shared.tsx (the copy actually imported by LandingPage.tsx)
// and from shared/hooks/usePublicStatsPoll.ts (the copy actually imported for live
// stats polling) — dead code, confirmed zero importers of those 5 names from this
// file. Only `formatHashrate`, `timeAgo`, and the `PublicStatsPayload`/`PublicFeed`/
// `FeedRow` types are real, live-imported exports (by landing.sections.tsx); this
// file now holds only those.
export type PublicStatsPayload = {
  ok: true;
  users?: number;
  activeMiners?: number;
  totalWithdrawn?: number;
  launchDate?: string;
};

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
