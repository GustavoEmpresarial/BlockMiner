/** Ported from legacy/server/modules/faucet/faucet.errors.ts. */
export const FAUCET_ERROR = {
  UNAUTHENTICATED: "FAUCET_UNAUTHENTICATED",
  COOLDOWN_ACTIVE: "FAUCET_COOLDOWN_ACTIVE",
  PARTNER_INCOMPLETE: "FAUCET_PARTNER_INCOMPLETE",
  REWARD_NOT_CONFIGURED: "FAUCET_REWARD_NOT_CONFIGURED",
} as const;

export type FaucetErrorCode = (typeof FAUCET_ERROR)[keyof typeof FAUCET_ERROR];
