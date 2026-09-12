/**
 * Structured error logging for the /inventory screen — same pattern as
 * stats/lib/stats.errors.ts and dashboard/lib/dashboard.errors.ts. Before this
 * module, every failure here (fetch, install, remove, buy, dismantle, place,
 * fan mount/unmount) only ever surfaced as `console.error('inventory2: ...')` or
 * a bare toast — never a stable code, never a correlation id, never anything a
 * backend error-tracking pipeline could group or alert on. This is exactly the
 * "página que mais dá problema" surface, and every listed failure here can move
 * a real owned machine (an asset) or spend real currency (room purchase), so
 * losing the failure signal to an un-structured console line is not acceptable.
 */

export type Inventory2ErrorCode =
  | 'INVENTORY_ROOMS_FETCH_FAILED'
  | 'INVENTORY_BACKPACK_FETCH_FAILED'
  | 'INVENTORY_PLACEMENTS_FETCH_FAILED'
  | 'INVENTORY_FAN_PLACEMENTS_FETCH_FAILED'
  | 'INVENTORY_BUY_ROOM_FAILED'
  | 'INVENTORY_INSTALL_FAILED'
  | 'INVENTORY_REMOVE_FAILED'
  | 'INVENTORY_MOVE_TO_VAULT_FAILED'
  | 'INVENTORY_MOVE_RACK_TO_VAULT_FAILED'
  | 'INVENTORY_DISMANTLE_RACK_FAILED'
  | 'INVENTORY_PLACE_RACK_FAILED'
  | 'INVENTORY_MOUNT_FAN_FAILED'
  | 'INVENTORY_UNMOUNT_FAN_FAILED';

export type Inventory2ErrorSeverity = 'ERROR' | 'CRITICAL';
export type Inventory2ErrorImpact = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Read-only fetch failures degrade to a stale/empty view (LOW). Anything that
 * moves an owned machine between backpack/rack/vault, or spends real BLK to buy
 * a room, is MEDIUM — the user sees a toast, but the underlying asset/currency
 * state may or may not have actually changed server-side, which is exactly the
 * kind of failure that should be traceable by error_id later. Nothing here is
 * scored HIGH: every one of these mutations goes through the server's own
 * idempotency-key + transaction guarantees (see server/modules/rooms/README.md),
 * so a client-side failure here means "the user didn't get confirmation," not
 * "the ledger is now inconsistent."
 */
const IMPACT_BY_CODE: Record<Inventory2ErrorCode, Inventory2ErrorImpact> = {
  INVENTORY_ROOMS_FETCH_FAILED: 'LOW',
  INVENTORY_BACKPACK_FETCH_FAILED: 'LOW',
  INVENTORY_PLACEMENTS_FETCH_FAILED: 'LOW',
  INVENTORY_FAN_PLACEMENTS_FETCH_FAILED: 'LOW',
  INVENTORY_BUY_ROOM_FAILED: 'MEDIUM',
  INVENTORY_INSTALL_FAILED: 'MEDIUM',
  INVENTORY_REMOVE_FAILED: 'MEDIUM',
  INVENTORY_MOVE_TO_VAULT_FAILED: 'MEDIUM',
  INVENTORY_MOVE_RACK_TO_VAULT_FAILED: 'MEDIUM',
  INVENTORY_DISMANTLE_RACK_FAILED: 'MEDIUM',
  INVENTORY_PLACE_RACK_FAILED: 'LOW',
  INVENTORY_MOUNT_FAN_FAILED: 'LOW',
  INVENTORY_UNMOUNT_FAN_FAILED: 'LOW',
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

export function fingerprintInventory2Error(code: Inventory2ErrorCode, err: unknown): string {
  const status = statusOf(err) ?? 'network';
  return `inventory2:${code}:${status}`;
}

export type Inventory2ErrorLogEntry = {
  errorId: string;
  correlationId: string;
  fingerprint: string;
  code: Inventory2ErrorCode;
  severity: Inventory2ErrorSeverity;
  impact: Inventory2ErrorImpact;
  source: 'inventory2';
  status: number | undefined;
  message: string;
};

/**
 * Logs an inventory2 error with a stable code, a unique per-occurrence error id,
 * a correlation id, and a fingerprint for grouping repeats. Returns the errorId
 * so a toast/UI could surface it for support (e.g. "código do erro: err_...").
 * Never logs response bodies/headers/payloads — only HTTP status + message.
 */
export function logInventory2Error(code: Inventory2ErrorCode, err: unknown): string {
  const errorId = newId('err');
  const correlationId = newId('corr');
  const fingerprint = fingerprintInventory2Error(code, err);
  const impact = IMPACT_BY_CODE[code];
  const severity: Inventory2ErrorSeverity = impact === 'MEDIUM' ? 'CRITICAL' : 'ERROR';
  const entry: Inventory2ErrorLogEntry = {
    errorId,
    correlationId,
    fingerprint,
    code,
    severity,
    impact,
    source: 'inventory2',
    status: statusOf(err),
    message: messageOf(err),
  };
  // eslint-disable-next-line no-console -- intentional structured error log, no logger util exists client-side yet
  console.error('[inventory2]', entry);
  return errorId;
}
