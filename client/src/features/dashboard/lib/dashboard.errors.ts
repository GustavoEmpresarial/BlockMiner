/**
 * Structured error logging for the dashboard feature.
 *
 * Before this module, every REST call in DashboardPage/DashboardBannersCarousel/
 * DashboardEnergyTaxModal used `.catch(() => {})` — failures were completely
 * invisible (no console entry, no admin client-error row, no way to tell "API is
 * down" apart from "user has zero balance"). This does not change UX (state
 * still degrades to defaults so the page never crashes), it only makes failures
 * observable with a stable code + correlation id.
 */

export type DashboardErrorCode =
  | 'DASHBOARD_CYCLE_FETCH_FAILED'
  | 'DASHBOARD_BALANCE_FETCH_FAILED'
  | 'DASHBOARD_SLOTS_FETCH_FAILED'
  | 'DASHBOARD_FEE_INFO_FETCH_FAILED'
  | 'DASHBOARD_ALLOCATION_SAVE_FAILED'
  | 'DASHBOARD_REFERRAL_LINK_FAILED'
  | 'DASHBOARD_REFERRAL_COPY_FAILED'
  | 'DASHBOARD_ENERGY_TAX_FETCH_FAILED'
  | 'DASHBOARD_ENERGY_TAX_PAY_FAILED'
  | 'DASHBOARD_BANNERS_FETCH_FAILED';

export type DashboardErrorSeverity = 'WARNING' | 'ERROR' | 'CRITICAL';
export type DashboardErrorImpact = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Read-only fetches degrade to defaults (a stale/empty card), so they stay LOW
 * impact even though something is broken upstream. Writes (allocation, energy-tax
 * payment, referral linking) can leave the user's money/state out of sync with
 * what they think happened, so they're rated MEDIUM/HIGH regardless of HTTP status.
 */
const IMPACT_BY_CODE: Record<DashboardErrorCode, DashboardErrorImpact> = {
  DASHBOARD_CYCLE_FETCH_FAILED: 'LOW',
  DASHBOARD_BALANCE_FETCH_FAILED: 'LOW',
  DASHBOARD_SLOTS_FETCH_FAILED: 'LOW',
  DASHBOARD_FEE_INFO_FETCH_FAILED: 'LOW',
  DASHBOARD_BANNERS_FETCH_FAILED: 'LOW',
  DASHBOARD_REFERRAL_COPY_FAILED: 'LOW',
  DASHBOARD_REFERRAL_LINK_FAILED: 'MEDIUM',
  DASHBOARD_ENERGY_TAX_FETCH_FAILED: 'MEDIUM',
  DASHBOARD_ALLOCATION_SAVE_FAILED: 'HIGH',
  DASHBOARD_ENERGY_TAX_PAY_FAILED: 'HIGH',
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

/**
 * Deterministic group key for a failure: same code hitting the same HTTP status
 * always collapses to the same fingerprint, so a spike of 10k identical failures
 * reads as "1 group, 10k occurrences" instead of 10k unrelated log lines — the
 * same idea a server-side error collector uses for grouping/dedup.
 */
export function fingerprintDashboardError(code: DashboardErrorCode, err: unknown): string {
  const status = statusOf(err) ?? 'network';
  return `dashboard:${code}:${status}`;
}

export type DashboardErrorLogEntry = {
  errorId: string;
  correlationId: string;
  fingerprint: string;
  code: DashboardErrorCode;
  severity: DashboardErrorSeverity;
  impact: DashboardErrorImpact;
  source: 'dashboard';
  status: number | undefined;
  message: string;
};

/**
 * Logs a dashboard error with a stable code, a unique per-occurrence error id,
 * a correlation id, and a fingerprint for grouping repeats of the same failure.
 * Returns the errorId so callers can (optionally) surface it in a toast for
 * support requests ("me manda o código do erro"). Never logs response
 * bodies/headers — only status + message — so it cannot leak tokens or PII
 * that a backend error payload might carry.
 */
export function logDashboardError(code: DashboardErrorCode, err: unknown): string {
  const errorId = newId('err');
  const correlationId = newId('corr');
  const fingerprint = fingerprintDashboardError(code, err);
  const impact = IMPACT_BY_CODE[code];
  const severity: DashboardErrorSeverity = impact === 'HIGH' ? 'CRITICAL' : 'ERROR';
  const entry: DashboardErrorLogEntry = {
    errorId,
    correlationId,
    fingerprint,
    code,
    severity,
    impact,
    source: 'dashboard',
    status: statusOf(err),
    message: messageOf(err),
  };
  // eslint-disable-next-line no-console -- intentional structured error log, no logger util exists client-side yet
  console.error('[dashboard]', entry);
  return errorId;
}
