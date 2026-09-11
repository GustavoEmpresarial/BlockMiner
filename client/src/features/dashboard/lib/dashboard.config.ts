function readPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {};

/** REST poll for GET /mining/cycle and GET /wallet/balance (matches legacy 15s cadence). */
export const DASHBOARD_REST_POLL_MS = readPositiveInt(viteEnv.VITE_DASHBOARD_REST_POLL_MS, 15_000);

/** Live POL balance card uses this many decimals while pending block accrual animates. */
export const DASHBOARD_POL_BALANCE_DECIMALS = 8;

/** Banner carousel auto-advance when more slides than visible columns. */
export const DASHBOARD_BANNER_AUTO_ADVANCE_MS = 5_000;

export const DASHBOARD_REFERRAL_CODE_MAX_LEN = 64;

/** Resync block countdown anchor when local smoothed value diverges from server by more than this (seconds). */
export const DASHBOARD_BLOCK_COUNTDOWN_RESYNC_SECONDS = 2;
