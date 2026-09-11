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
