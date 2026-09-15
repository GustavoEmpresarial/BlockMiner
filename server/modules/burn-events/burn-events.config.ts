/**
 * Burn process duration — product default from ops (15 min), overridable via env.
 * Do not invent ad-hoc ms in call sites.
 */
export const DEFAULT_BURN_PROCESS_DURATION_SECONDS = 15 * 60;

export const BURN_PROCESS_DURATION_ENV_KEY = "BURN_PROCESS_DURATION_SECONDS";

export function readBurnProcessDurationSeconds(
  raw: string | undefined | null = process.env[BURN_PROCESS_DURATION_ENV_KEY],
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_BURN_PROCESS_DURATION_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_BURN_PROCESS_DURATION_SECONDS;
  return Math.floor(n);
}

/**
 * How many times EACH player may complete a given burn event.
 * This is NOT a global machine pool and NOT a cap on machines selected in one burn.
 * Live NeonForge event: 10 queimas por usuário.
 */
export const DEFAULT_BURN_CLAIM_LIMIT_PER_USER = 10;
export const BURN_CLAIM_LIMIT_PER_USER_ENV_KEY = "BURN_CLAIM_LIMIT_PER_USER";
export const MAX_BURN_CLAIM_LIMIT_PER_USER = 10_000;

export function readDefaultBurnClaimLimitPerUser(
  raw: string | undefined | null = process.env[BURN_CLAIM_LIMIT_PER_USER_ENV_KEY],
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_BURN_CLAIM_LIMIT_PER_USER;
  return normalizeClaimLimitPerUser(raw);
}

export function normalizeClaimLimitPerUser(raw: unknown): number {
  if (raw == null || raw === "") return DEFAULT_BURN_CLAIM_LIMIT_PER_USER;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_BURN_CLAIM_LIMIT_PER_USER;
  return Math.min(MAX_BURN_CLAIM_LIMIT_PER_USER, Math.max(1, Math.floor(n)));
}

/**
 * Global reward pool for the whole event (all players combined).
 * `null` = unlimited. Never confuse this with `claimLimitPerUser`.
 */
export const DEFAULT_BURN_STOCK_TOTAL: number | null = null;

export function normalizeStockTotal(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Input-size cap on owned-machine ids in one start payload (DoS / unbounded IN query).
 * This is NOT a product "10 machines per burn" rule — the product limit is H/s + per-user claims.
 */
export const DEFAULT_MAX_BURN_OWNED_MACHINE_IDS = 2_000;
export const MAX_BURN_OWNED_MACHINE_IDS_ENV_KEY = "MAX_BURN_OWNED_MACHINE_IDS";

export function readMaxBurnOwnedMachineIds(
  raw: string | undefined | null = process.env[MAX_BURN_OWNED_MACHINE_IDS_ENV_KEY],
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_MAX_BURN_OWNED_MACHINE_IDS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_BURN_OWNED_MACHINE_IDS;
  return Math.min(DEFAULT_MAX_BURN_OWNED_MACHINE_IDS, Math.floor(n));
}

/** Sliding-window rate limits for player burn routes. */
export const BURN_WRITE_RATE_LIMIT_WINDOW_MS = 60_000;
export const BURN_WRITE_RATE_LIMIT_MAX = 20;
export const BURN_READ_RATE_LIMIT_WINDOW_MS = 60_000;
export const BURN_READ_RATE_LIMIT_MAX = 120;
export const BURN_ADMIN_WRITE_RATE_LIMIT_WINDOW_MS = 60_000;
export const BURN_ADMIN_WRITE_RATE_LIMIT_MAX = 40;

/**
 * Fixed burn fees per burn event session ("cada queima").
 * Player can pay using either SHIB (20), POL (0.01), or BLK (0.001).
 */
export const BURN_FEE_RATES = {
  SHIB: 20,
  POL: 0.01,
  BLK: 0.001,
} as const;

export type BurnFeeCurrency = keyof typeof BURN_FEE_RATES;

export const ALLOWED_BURN_FEE_CURRENCIES: readonly BurnFeeCurrency[] = ["SHIB", "POL", "BLK"] as const;

export function isAllowedBurnFeeCurrency(curr: unknown): curr is BurnFeeCurrency {
  return typeof curr === "string" && (ALLOWED_BURN_FEE_CURRENCIES as readonly string[]).includes(curr);
}

export function getBurnFeeAmount(currency: BurnFeeCurrency): number {
  return BURN_FEE_RATES[currency];
}
