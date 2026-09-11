/**
 * Pure earnings-stats helpers — no Prisma/DB imports (unit-test friendly).
 */

export type EarningsPeriod = "7d" | "30d" | "90d" | "all";

export type EarningsTotals = {
  total: number;
  mining: number;
  offerwall: number;
  offerwallInternal: number;
  offerwallExternal: number;
  faucet: number;
  shortlinks: number;
  youtube: number;
  games: number;
  autoMining: number;
  checkin: number;
  referrals: number;
};

export type EarningsHistoryPoint = EarningsTotals & { date: string };

function roundPol(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** Pure rollup from source→amount map (materialized rows or tests). */
export function rollupEarningsTotalsFromSourceMap(bySource: Record<string, number>): EarningsTotals {
  const offerwallInternal = roundPol(Number(bySource.offerwallInternal ?? 0));
  const offerwallExternal = roundPol(Number(bySource.offerwallExternal ?? 0));
  const totals: EarningsTotals = {
    mining: roundPol(Number(bySource.mining ?? 0)),
    offerwallInternal,
    offerwallExternal,
    offerwall: roundPol(offerwallInternal + offerwallExternal),
    faucet: roundPol(Number(bySource.faucet ?? 0)),
    shortlinks: roundPol(Number(bySource.shortlinks ?? 0)),
    youtube: roundPol(Number(bySource.youtube ?? 0)),
    games: roundPol(Number(bySource.games ?? 0)),
    autoMining: roundPol(Number(bySource.autoMining ?? 0)),
    checkin: roundPol(Number(bySource.checkin ?? 0)),
    referrals: roundPol(Number(bySource.referrals ?? 0)),
    total: 0,
  };
  totals.total = roundPol(
    totals.mining +
      totals.offerwall +
      totals.faucet +
      totals.shortlinks +
      totals.youtube +
      totals.games +
      totals.autoMining +
      totals.checkin +
      totals.referrals,
  );
  return totals;
}

/** Stable keys for GET /stats/earnings payload (shape contract). */
export const EARNINGS_STATS_PAYLOAD_KEYS = [
  "total",
  "mining",
  "offerwall",
  "offerwallInternal",
  "offerwallExternal",
  "faucet",
  "shortlinks",
  "youtube",
  "games",
  "autoMining",
  "checkin",
  "referrals",
  "referralStatsSince",
  "period",
  "history",
  "powerMeta",
] as const;

export function parseEarningsPeriod(raw: unknown): EarningsPeriod {
  const p = String(raw ?? "30d").trim().toLowerCase();
  if (p === "7d" || p === "30d" || p === "90d" || p === "all") return p;
  return "30d";
}
