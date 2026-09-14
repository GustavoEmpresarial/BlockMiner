export const BURN_EVENTS_ERROR = {
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  EVENT_CLOSED: "EVENT_CLOSED",
  CLAIM_LIMIT_REACHED: "CLAIM_LIMIT_REACHED",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  INVALID_MACHINES: "INVALID_MACHINES",
  INSUFFICIENT_HASHRATE: "INSUFFICIENT_HASHRATE",
  NO_MACHINES_SELECTED: "NO_MACHINES_SELECTED",
  BURN_NOT_READY: "BURN_NOT_READY",
  BURN_SESSION_NOT_FOUND: "BURN_SESSION_NOT_FOUND",
  BURN_SESSION_INVALID: "BURN_SESSION_INVALID",
  INVALID_FEE_CURRENCY: "INVALID_FEE_CURRENCY",
  INSUFFICIENT_FEE_BALANCE: "INSUFFICIENT_FEE_BALANCE",
} as const;

export type BurnEventsErrorCode = (typeof BURN_EVENTS_ERROR)[keyof typeof BURN_EVENTS_ERROR];

export function burnEventsError(code: string, message?: string): Error & { code: string } {
  return Object.assign(new Error(message ?? code), { code });
}

export function httpStatusForBurnCode(code: string): number {
  if (code === BURN_EVENTS_ERROR.EVENT_NOT_FOUND) return 404;
  if (code === BURN_EVENTS_ERROR.BURN_SESSION_NOT_FOUND) return 404;
  if (code === "UNAUTHENTICATED") return 401;
  return 400;
}
