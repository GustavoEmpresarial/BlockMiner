/**
 * Structured error logging for the Cofre de Mineradores (vault) screen — same
 * pattern as features/inventory2/lib/inventory2.errors.ts and
 * features/stats/lib/stats.errors.ts. Before this module, vault failures only
 * ever surfaced as `console.error('fetchVault:', error)` or a bare toast — no
 * stable code, no correlation id, nothing a backend error-tracking pipeline
 * could group or alert on. Every mutation here moves a real owned machine
 * (an asset) between the rack/inventory and the vault, so losing the failure
 * signal to an un-structured console line is not acceptable. Moving a machine
 * INTO the vault happens from the inventory screen and is already logged
 * there (features/inventory2/lib/inventory2.errors.ts — INVENTORY_MOVE_TO_VAULT_FAILED
 * / INVENTORY_MOVE_RACK_TO_VAULT_FAILED), so this module only covers the vault
 * screen's own list-fetch and retrieve-from-vault paths.
 */

export type VaultErrorCode = 'VAULT_LIST_FETCH_FAILED' | 'VAULT_RETRIEVE_FAILED';

export type VaultErrorSeverity = 'ERROR' | 'CRITICAL';
export type VaultErrorImpact = 'LOW' | 'MEDIUM';

/**
 * A failed list fetch degrades to a stale/empty view (LOW) — the vault stays a
 * read-only viewport in that case. Retrieve relocates an owned machine out of
 * the vault into the rack/inventory, so a failure there is MEDIUM: the
 * underlying asset state may or may not have actually changed server-side,
 * which is exactly the kind of failure that should be traceable by error_id
 * later. Never HIGH — the mutation goes through the same server-side
 * idempotency-key + transaction guarantees as inventory/rooms.
 */
const IMPACT_BY_CODE: Record<VaultErrorCode, VaultErrorImpact> = {
  VAULT_LIST_FETCH_FAILED: 'LOW',
  VAULT_RETRIEVE_FAILED: 'MEDIUM',
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

export function fingerprintVaultError(code: VaultErrorCode, err: unknown): string {
  const status = statusOf(err) ?? 'network';
  return `vault:${code}:${status}`;
}

export type VaultErrorLogEntry = {
  errorId: string;
  correlationId: string;
  fingerprint: string;
  code: VaultErrorCode;
  severity: VaultErrorSeverity;
  impact: VaultErrorImpact;
  source: 'vault';
  status: number | undefined;
  message: string;
};

/**
 * Logs a vault error with a stable code, a unique per-occurrence error id, a
 * correlation id, and a fingerprint for grouping repeats. Returns the errorId
 * so a toast/UI could surface it for support. Never logs response
 * bodies/headers/payloads — only HTTP status + message.
 */
export function logVaultError(code: VaultErrorCode, err: unknown): string {
  const errorId = newId('err');
  const correlationId = newId('corr');
  const fingerprint = fingerprintVaultError(code, err);
  const impact = IMPACT_BY_CODE[code];
  const severity: VaultErrorSeverity = impact === 'MEDIUM' ? 'CRITICAL' : 'ERROR';
  const entry: VaultErrorLogEntry = {
    errorId,
    correlationId,
    fingerprint,
    code,
    severity,
    impact,
    source: 'vault',
    status: statusOf(err),
    message: messageOf(err),
  };
  // eslint-disable-next-line no-console -- intentional structured error log, no logger util exists client-side yet
  console.error('[vault]', entry);
  return errorId;
}
