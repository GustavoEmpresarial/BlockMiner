/** Shared Zerads callback types — used by service + controller. */

export type ZeradsCallbackParams = {
  clientIp: string;
  pwd: string | undefined;
  username: string | undefined;
  rawAmount: string | undefined;
  rawClicks: string | undefined;
};

export type ZeradsCallbackResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code:
        | "NO_SECRET_CONFIGURED"
        | "BAD_PASSWORD"
        | "MISSING_USERNAME"
        | "INVALID_AMOUNT"
        | "NO_CLICKS"
        | "USER_NOT_FOUND"
        | "USER_BANNED"
        | "TRANSACTION_FAILED";
    };
