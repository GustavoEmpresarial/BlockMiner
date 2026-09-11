/**
 * Ported from legacy/server/modules/checkin/domain/checkin.errors.ts.
 * Shared error → HTTP response mapping for the check-in handlers.
 */

/** Domain rejection thrown from inside the check-in transaction, carrying a stable error code. */
export class CheckinHttpError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CheckinHttpError";
  }
}

export type CheckinErrorResponse = { status: number; code: string; message: string };

/**
 * Maps a caught error to the HTTP response the handler should send, or `null` when the error is
 * unknown (caller then logs and returns a generic 500).
 */
export function mapCheckinError(err: unknown): CheckinErrorResponse | null {
  if (err instanceof CheckinHttpError) {
    switch (err.code) {
      case "CHECKIN_PENDING_PAYMENT":
        return {
          status: 409,
          code: "CHECKIN_PENDING_PAYMENT",
          message:
            "A wallet payment is already waiting for confirmation today. Wait for it to confirm or fail, then try again.",
        };
      case "INSUFFICIENT_BALANCE":
        return {
          status: 400,
          code: "INSUFFICIENT_BALANCE",
          message: "Not enough in-game POL for balance check-in.",
        };
      case "WALLET_REQUIRED":
        return {
          status: 400,
          code: "WALLET_REQUIRED",
          message: "Link and verify your wallet on the Wallet page before check-in.",
        };
      case "FORBIDDEN":
        return {
          status: 403,
          code: "FORBIDDEN",
          message: "Check-in is not available for this account.",
        };
      default:
        break;
    }
  }

  const code = (err as { code?: string } | null | undefined)?.code;
  if (code === "DISTRIBUTED_LOCK_BUSY" || code === "P2034") {
    return {
      status: 409,
      code: "CHECKIN_BUSY",
      message: "Another check-in request is in progress. Wait a moment and try again.",
    };
  }
  if (code === "P2002") {
    return {
      status: 409,
      code: "CHECKIN_CONFLICT",
      message: "Check-in was already recorded. Refresh the page.",
    };
  }

  return null;
}
