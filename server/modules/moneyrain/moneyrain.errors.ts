/** Ported from the exact response codes/messages legacy/moneyrain.controller.ts uses. */
export const MONEYRAIN_ERROR = {
  UNAUTHENTICATED: "MONEYRAIN_UNAUTHENTICATED",
  MAINTENANCE: "MONEYRAIN_MAINTENANCE",
  NOT_CONFIGURED: "MONEYRAIN_NOT_CONFIGURED",
} as const;

export type MoneyRainErrorCode = (typeof MONEYRAIN_ERROR)[keyof typeof MONEYRAIN_ERROR];
