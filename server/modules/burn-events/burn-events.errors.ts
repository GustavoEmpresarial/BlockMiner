export const BURN_EVENTS_ERROR = {
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  EVENT_CLOSED: "EVENT_CLOSED",
  CLAIM_LIMIT_REACHED: "CLAIM_LIMIT_REACHED",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  INVALID_MACHINES: "INVALID_MACHINES",
  INSUFFICIENT_HASHRATE: "INSUFFICIENT_HASHRATE",
  NO_MACHINES_SELECTED: "NO_MACHINES_SELECTED",
  TOO_MANY_MACHINES: "TOO_MANY_MACHINES",
  BURN_NOT_READY: "BURN_NOT_READY",
  BURN_SESSION_NOT_FOUND: "BURN_SESSION_NOT_FOUND",
  BURN_SESSION_INVALID: "BURN_SESSION_INVALID",
  /** User already has a pending burn for this event — do not start another / cancel the first. */
  BURN_ALREADY_PENDING: "BURN_ALREADY_PENDING",
  /** Start claimed success but owned-machine rows were not fully removed — transaction must roll back. */
  BURN_DESTROY_INCOMPLETE: "BURN_DESTROY_INCOMPLETE",
  INVALID_FEE_CURRENCY: "INVALID_FEE_CURRENCY",
  INSUFFICIENT_FEE_BALANCE: "INSUFFICIENT_FEE_BALANCE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type BurnEventsErrorCode = (typeof BURN_EVENTS_ERROR)[keyof typeof BURN_EVENTS_ERROR];

const PUBLIC_MESSAGES: Record<string, string> = {
  [BURN_EVENTS_ERROR.EVENT_NOT_FOUND]: "Event not found.",
  [BURN_EVENTS_ERROR.EVENT_CLOSED]: "This burn event is not open.",
  [BURN_EVENTS_ERROR.CLAIM_LIMIT_REACHED]: "You already reached the per-user burn limit for this event.",
  [BURN_EVENTS_ERROR.OUT_OF_STOCK]: "This burn event is out of stock.",
  [BURN_EVENTS_ERROR.INVALID_MACHINES]: "One or more selected machines are not valid for this burn.",
  [BURN_EVENTS_ERROR.INSUFFICIENT_HASHRATE]: "Selected machines do not meet the required hashrate.",
  [BURN_EVENTS_ERROR.NO_MACHINES_SELECTED]: "Select at least one machine.",
  [BURN_EVENTS_ERROR.TOO_MANY_MACHINES]: "Too many machines in a single burn request.",
  [BURN_EVENTS_ERROR.BURN_NOT_READY]: "Burn process still running.",
  [BURN_EVENTS_ERROR.BURN_SESSION_NOT_FOUND]: "Burn session not found.",
  [BURN_EVENTS_ERROR.BURN_SESSION_INVALID]: "Invalid burn session.",
  [BURN_EVENTS_ERROR.BURN_ALREADY_PENDING]:
    "Você já tem uma queima em andamento neste evento. Aguarde o timer e colete o prêmio.",
  [BURN_EVENTS_ERROR.BURN_DESTROY_INCOMPLETE]: "Burn could not destroy the selected machines.",
  [BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY]: "Moeda de taxa inválida. Escolha entre 'SHIB', 'POL' ou 'BLK'.",
  [BURN_EVENTS_ERROR.INSUFFICIENT_FEE_BALANCE]: "Saldo insuficiente para a taxa da queima.",
  [BURN_EVENTS_ERROR.VALIDATION_ERROR]: "Invalid request body.",
};

export function isBurnEventsErrorCode(code: string): code is BurnEventsErrorCode {
  return Object.values(BURN_EVENTS_ERROR).includes(code as BurnEventsErrorCode);
}

export function publicMessageForBurnCode(code: string, fallback?: string): string {
  return PUBLIC_MESSAGES[code] ?? fallback ?? "Burn request failed.";
}

export function burnEventsError(code: string, message?: string): Error & { code: string } {
  return Object.assign(new Error(message ?? publicMessageForBurnCode(code)), { code });
}

export function httpStatusForBurnCode(code: string): number {
  if (code === BURN_EVENTS_ERROR.EVENT_NOT_FOUND) return 404;
  if (code === BURN_EVENTS_ERROR.BURN_SESSION_NOT_FOUND) return 404;
  if (code === "UNAUTHENTICATED") return 401;
  if (code === BURN_EVENTS_ERROR.BURN_DESTROY_INCOMPLETE) return 500;
  if (
    code === BURN_EVENTS_ERROR.CLAIM_LIMIT_REACHED ||
    code === BURN_EVENTS_ERROR.OUT_OF_STOCK ||
    code === BURN_EVENTS_ERROR.EVENT_CLOSED ||
    code === BURN_EVENTS_ERROR.BURN_ALREADY_PENDING ||
    code === BURN_EVENTS_ERROR.BURN_NOT_READY
  ) {
    return 409;
  }
  return 400;
}
