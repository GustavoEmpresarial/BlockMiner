/**
 * Structured error logging for the stats/power feature — same pattern as
 * dashboard/lib/dashboard.errors.ts. Before this module, useUserPowerStats/
 * useUserEarningsStats only ever set a user-facing message string; a failure was
 * never observable as anything but "the stats page shows an error banner", with no
 * stable code, no correlation id, and no way to group repeats of the same failure.
 */

export type StatsErrorCode =
  | 'STATS_POWER_FETCH_FAILED'
  | 'STATS_EARNINGS_FETCH_FAILED'
  | 'STATS_PAYOUT_MODE_SWITCH_FAILED';

export type StatsErrorSeverity = 'ERROR' | 'CRITICAL';
export type StatsErrorImpact = 'LOW' | 'MEDIUM';

/** Both fetches degrade to an error banner (LOW impact); the payout-mode switch changes
 *  which currency the user's mining rewards settle in, so a silent failure there is worse
 *  than a stale read. */
const IMPACT_BY_CODE: Record<StatsErrorCode, StatsErrorImpact> = {
  STATS_POWER_FETCH_FAILED: 'LOW',
  STATS_EARNINGS_FETCH_FAILED: 'LOW',
  STATS_PAYOUT_MODE_SWITCH_FAILED: 'MEDIUM',
};

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function statusOf(err: unknown): number | undefined {
  const response = (err as { response?: { status?: unknown } } | null)?.response;
  const status = response?.status;
  return typeof status === 'number' ? status : undefined;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown_error';
}

export function fingerprintStatsError(code: StatsErrorCode, err: unknown): string {
  const status = statusOf(err) ?? 'network';
  return `stats:${code}:${status}`;
}

export type StatsErrorLogEntry = {
  errorId: string;
  correlationId: string;
  fingerprint: string;
  code: StatsErrorCode;
  severity: StatsErrorSeverity;
  impact: StatsErrorImpact;
  source: 'stats';
  status: number | undefined;
  message: string;
};

/**
 * Logs a stats error with a stable code, a unique per-occurrence error id, a
 * correlation id, and a fingerprint for grouping repeats. Returns the errorId.
 * Never logs response bodies/headers — only status + message.
 */
export function logStatsError(code: StatsErrorCode, err: unknown): string {
  const errorId = newId('err');
  const correlationId = newId('corr');
  const fingerprint = fingerprintStatsError(code, err);
  const impact = IMPACT_BY_CODE[code];
  const severity: StatsErrorSeverity = impact === 'MEDIUM' ? 'CRITICAL' : 'ERROR';
  const entry: StatsErrorLogEntry = {
    errorId,
    correlationId,
    fingerprint,
    code,
    severity,
    impact,
    source: 'stats',
    status: statusOf(err),
    message: messageOf(err),
  };
  // eslint-disable-next-line no-console -- intentional structured error log, no logger util exists client-side yet
  console.error('[stats]', entry);
  return errorId;
}
