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

