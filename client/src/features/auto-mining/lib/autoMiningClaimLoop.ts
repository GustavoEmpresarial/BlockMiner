/**
 * Pure claim-loop helpers. The 1s poll used to treat every HTTP 200 "not ready"
 * as a failed cycle, so three CLAIM_NOT_DUE replies (normal clock / timer drift)
 * flooded admin client-errors as "3+ cycles with no grant".
 */

/** Same threshold the page already used — named so tests can lock it. */
export const AUTO_MINING_STALL_REPORT_AFTER_CYCLES = 3;

/** Server said "wait, then try again" — not "this cycle produced no grant". */
export const BENIGN_CLAIM_WAIT_CODES = Object.freeze([
  "CLAIM_NOT_DUE",
  "PRESENCE_INSUFFICIENT",
  "PRESENCE_STALE",
  "SESSION_PAUSED",
  "CONCURRENT_CLAIM",
  "NO_SESSION",
] as const);

const BENIGN_WAIT_SET = new Set<string>(BENIGN_CLAIM_WAIT_CODES);

export function shouldCountAsStalledCycle(
  code: string | undefined,
  _retryAfterMs?: number,
): boolean {
  if (!code) return true;
  if (BENIGN_WAIT_SET.has(code)) return false;
  return true;
}

export function isBenignAutoMiningStallCode(code: string | null | undefined): boolean {
  return !!code && BENIGN_WAIT_SET.has(code);
}

/** Fire when the target instant has been reached — do not ceil to whole seconds. */
export function isClaimTargetDue(targetIso: string, nowMs: number): boolean {
  const t = new Date(targetIso).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs >= t;
}

/**
 * A stale /auto-mining-gpu/v2/status poll must not rewind a later nextClaimAt
 * (that made the 1s poll fire immediately and collect CLAIM_NOT_DUE ~59s).
 */
export function adoptLaterNextClaimAt(
  current: string | null,
  incoming: string | null,
): string | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const currentMs = new Date(current).getTime();
  const incomingMs = new Date(incoming).getTime();
  if (!Number.isFinite(incomingMs)) return current;
  if (!Number.isFinite(currentMs)) return incoming;
  return incomingMs >= currentMs ? incoming : current;
}
