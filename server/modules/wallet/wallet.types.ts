/** Module-wide wallet types. Ported (trimmed) from legacy wallet/domain/wallet.types.ts. */

export const WITHDRAW_MIN_POL = 10;
export const WITHDRAW_PROCESSING_HOURS = 24;
export const VALID_MINING_PAYOUT_MODES = new Set(["pol"]);

/** Flat SHIB ERC20 withdraw fee (matches SPA `L0` / legacy `SHIB_WITHDRAW_FEE`). */
function envPositiveNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envFlagEnabled(name: string, defaultEnabled: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultEnabled;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  return defaultEnabled;
}

/** Default matches live SPA fee chip (7800 SHIB). Override via `SHIB_WITHDRAW_FEE`. */
export const SHIB_WITHDRAW_FEE = envPositiveNumber("SHIB_WITHDRAW_FEE", 7800);

/**
 * Minimum SHIB withdraw floor in USD (UI copy "$0.10"). Converted to SHIB via live price.
 * Override via `WITHDRAW_MIN_SHIB_USD`.
 */
export const WITHDRAW_MIN_SHIB_USD = envPositiveNumber("WITHDRAW_MIN_SHIB_USD", 0.1);

/** Master switch — off by default; set `SHIB_WITHDRAWALS_ENABLED=1` to allow user SHIB withdraw. */
export const SHIB_WITHDRAWALS_ENABLED = envFlagEnabled("SHIB_WITHDRAWALS_ENABLED", false);

/** Pure: SHIB units needed to cover `minUsd` at `shibUsd` (ceil). */
export function computeMinShibFromUsd(minUsd: number, shibUsd: number): number {
  if (!(minUsd > 0) || !(shibUsd > 0)) return 0;
  return Math.ceil(minUsd / shibUsd);
}

/** Currencies carried directly as `Decimal` fields on `User` (no dedicated Wallet model). */
export const WALLET_CURRENCIES = ["pol", "btc", "eth", "usdt", "usdc", "zer", "blk", "shib"] as const;
export type WalletCurrency = (typeof WALLET_CURRENCIES)[number];

/**
 * GET /api/wallet/balance payload (client contract).
 * Legacy used `balance` for POL — keep that name; do not rename to polBalance.
 */
export type WalletBalanceDto = {
  balance: number;
  blkBalance: number;
  blkLocked: number;
  shibBalance: number;
  miningPayoutMode: string;
  blkUsdEquivalent: number;
  lifetimeMined: number;
  totalWithdrawn: number;
  walletAddress: string | null;
  /** Extra currency fields (display / admin); optional for dashboard. */
  btcBalance?: number;
  ethBalance?: number;
  usdtBalance?: number;
  usdcBalance?: number;
  zerBalance?: number;
};
