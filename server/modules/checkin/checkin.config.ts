/**
 * Check-in runtime policy — env-driven, no invented literals in call sites.
 * Defaults below are product defaults; override via env when adapting deployments.
 */

const VALID_MODES = new Set(["offchain", "onchain", "hybrid"] as const);
export type CheckinMode = "offchain" | "onchain" | "hybrid";

const WEI_PER_POL = 1_000_000_000_000_000_000n;
const MICRO_POL_SCALE = 1_000_000;

/** Default grace window after UTC period end (hours). Override: CHECKIN_GRACE_HOURS. */
const DEFAULT_GRACE_HOURS = 6;
const GRACE_HOURS_MIN = 0;
const GRACE_HOURS_MAX = 48;

const DEFAULT_MAX_GRACE_PER_MONTH = 2;
const DEFAULT_MAX_FREEZE_PER_MONTH = 1;

/** Default on-chain / balance debit in POL. Override via CHECKIN_*_AMOUNT_POL. */
const DEFAULT_WALLET_CHECKIN_POL = 0.01;
const DEFAULT_BALANCE_CHECKIN_POL = 0.01;

/** Paid streak recovery fee (POL). Override: CHECKIN_RECOVERY_FEE_POL. */
const DEFAULT_RECOVERY_FEE_POL = 0.03;
/** Max missed UTC days recoverable in one paid recovery. Override: CHECKIN_RECOVERY_MAX_MISSED_DAYS. */
const DEFAULT_RECOVERY_MAX_MISSED_DAYS = 3;

/** Pending-resolution cron interval. Override: CHECKIN_PENDING_CRON_MS. */
const DEFAULT_PENDING_CRON_MS = 5 * 60 * 1000;
const PENDING_CRON_MS_MIN = 30_000;
const PENDING_CRON_MS_MAX = 60 * 60 * 1000;

/** Streak anomaly monitor interval. Override: CHECKIN_MONITOR_CRON_MS. */
const DEFAULT_MONITOR_CRON_MS = 15 * 60 * 1000;
const MONITOR_CRON_MS_MIN = 60_000;
const MONITOR_CRON_MS_MAX = 6 * 60 * 60 * 1000;

/** How many recent confirmed rows to scan per monitor pass. Override: CHECKIN_MONITOR_LOOKBACK_ROWS. */
const DEFAULT_MONITOR_LOOKBACK_ROWS = 500;
const MONITOR_LOOKBACK_MIN = 50;
const MONITOR_LOOKBACK_MAX = 5_000;

export const CHECKIN_PAYMENT_GRACE_BRIDGE = "grace_bridge";
export const CHECKIN_PAYMENT_FREEZE_BRIDGE = "freeze_bridge";
export const CHECKIN_PAYMENT_STREAK_RECOVERY = "streak_recovery";
export const CHECKIN_PAYMENT_ADMIN_RESTORE = "admin_streak_restore";

function readIntEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function readBoolEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const v = String(env[key] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function readPolAmountEnvAsWei(env: NodeJS.ProcessEnv, key: string, fallbackPol: number): bigint {
  const raw = String(env[key] ?? "").trim();
  const pol = raw ? Number(raw) : fallbackPol;
  const safePol = Number.isFinite(pol) && pol >= 0 ? pol : fallbackPol;
  const microPol = Math.round(safePol * MICRO_POL_SCALE);
  return (BigInt(microPol) * WEI_PER_POL) / BigInt(MICRO_POL_SCALE);
}

function readPolAmountEnv(env: NodeJS.ProcessEnv, key: string, fallbackPol: number): number {
  const raw = String(env[key] ?? "").trim();
  const pol = raw ? Number(raw) : fallbackPol;
  if (!Number.isFinite(pol) || pol < 0) return fallbackPol;
  return pol;
}

/** CHECKIN_MODE: offchain | onchain | hybrid (default offchain — balance only). */
export function getCheckinMode(env: NodeJS.ProcessEnv = process.env): CheckinMode {
  const raw = String(env.CHECKIN_MODE ?? "offchain").trim().toLowerCase();
  if ((VALID_MODES as Set<string>).has(raw)) return raw as CheckinMode;
  return "offchain";
}

/** Hours after period end where a missed day can still preserve streak. */
export function getCheckinGraceHours(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_GRACE_HOURS", DEFAULT_GRACE_HOURS, GRACE_HOURS_MIN, GRACE_HOURS_MAX);
}

export function isCheckinStreakFreezeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBoolEnv(env, "CHECKIN_STREAK_FREEZE_ENABLED", true);
}

export function getCheckinMaxGraceUsesPerMonth(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_MAX_GRACE_USES_PER_MONTH", DEFAULT_MAX_GRACE_PER_MONTH, 0, 31);
}

export function getCheckinMaxFreezeUsesPerMonth(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_MAX_FREEZE_USES_PER_MONTH", DEFAULT_MAX_FREEZE_PER_MONTH, 0, 10);
}

export function requiresWalletForOffchainCheckin(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = getCheckinMode(env);
  if (mode === "onchain") return true;
  return readBoolEnv(env, "CHECKIN_OFFCHAIN_REQUIRES_WALLET", false);
}

export function allowsWalletCheckin(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = getCheckinMode(env);
  return mode === "onchain" || mode === "hybrid";
}

export function allowsOffchainCheckin(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = getCheckinMode(env);
  return mode === "offchain" || mode === "hybrid";
}

export function isCheckinPaymentRequired(): boolean {
  return true;
}

export function getWalletCheckinWei(env: NodeJS.ProcessEnv = process.env): bigint {
  return readPolAmountEnvAsWei(env, "CHECKIN_AMOUNT_POL", DEFAULT_WALLET_CHECKIN_POL);
}

export function getBalanceCheckinWei(env: NodeJS.ProcessEnv = process.env): bigint {
  return readPolAmountEnvAsWei(env, "CHECKIN_BALANCE_AMOUNT_POL", DEFAULT_BALANCE_CHECKIN_POL);
}

export function getCheckinRecoveryFeePol(env: NodeJS.ProcessEnv = process.env): number {
  return readPolAmountEnv(env, "CHECKIN_RECOVERY_FEE_POL", DEFAULT_RECOVERY_FEE_POL);
}

export function getCheckinRecoveryMaxMissedDays(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_RECOVERY_MAX_MISSED_DAYS", DEFAULT_RECOVERY_MAX_MISSED_DAYS, 1, 14);
}

export function getCheckinPendingCronMs(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_PENDING_CRON_MS", DEFAULT_PENDING_CRON_MS, PENDING_CRON_MS_MIN, PENDING_CRON_MS_MAX);
}

export function getCheckinMonitorCronMs(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_MONITOR_CRON_MS", DEFAULT_MONITOR_CRON_MS, MONITOR_CRON_MS_MIN, MONITOR_CRON_MS_MAX);
}

export function getCheckinMonitorLookbackRows(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(
    env,
    "CHECKIN_MONITOR_LOOKBACK_ROWS",
    DEFAULT_MONITOR_LOOKBACK_ROWS,
    MONITOR_LOOKBACK_MIN,
    MONITOR_LOOKBACK_MAX,
  );
}

export function isCheckinMonitorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readBoolEnv(env, "CHECKIN_MONITOR_ENABLED", true);
}

/** Batch size for pending wallet finalization cron. Override: CHECKIN_PENDING_BATCH_SIZE. */
const DEFAULT_PENDING_BATCH_SIZE = 40;
const PENDING_BATCH_MIN = 1;
const PENDING_BATCH_MAX = 200;

export function getCheckinPendingBatchSize(env: NodeJS.ProcessEnv = process.env): number {
  return readIntEnv(env, "CHECKIN_PENDING_BATCH_SIZE", DEFAULT_PENDING_BATCH_SIZE, PENDING_BATCH_MIN, PENDING_BATCH_MAX);
}
