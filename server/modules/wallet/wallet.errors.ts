/** Module-wide wallet error codes. Ported from legacy wallet/domain/wallet.errors.ts. */
export const WALLET_ERROR = {
  INVALID_ADDRESS: "WALLET_INVALID_ADDRESS",
  INVALID_CHAIN: "WALLET_INVALID_CHAIN",
  CHALLENGE_NOT_FOUND: "WALLET_CHALLENGE_NOT_FOUND",
  CHALLENGE_EXPIRED: "WALLET_CHALLENGE_EXPIRED",
  INVALID_SIGNATURE: "WALLET_INVALID_SIGNATURE",
  UNAUTHENTICATED: "WALLET_UNAUTHENTICATED",
  INSUFFICIENT_BALANCE: "WALLET_INSUFFICIENT_BALANCE",
  PENDING_WITHDRAWAL_EXISTS: "WALLET_PENDING_WITHDRAWAL_EXISTS",
} as const;

export class InsufficientBalanceError extends Error {
  readonly http = 400;
  readonly code = WALLET_ERROR.INSUFFICIENT_BALANCE;
  constructor(message = "Insufficient balance.") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}
