/** Domain errors for auto-mining (v1 GPU + v2 session). Thrown by the service layer, mapped
 *  to HTTP by the controllers (see auto-mining.controller.ts / auto-mining.v2.controller.ts). */

export class AutoMiningError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.name = "AutoMiningError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function autoMiningError(code: string, message?: string): AutoMiningError {
  return new AutoMiningError(code, message);
}

export const AUTO_MINING_ERROR_CODES = {
  GPU_NOT_FOUND: "GPU_NOT_FOUND",
  DAILY_LIMIT_REACHED: "DAILY_LIMIT_REACHED",
  INSUFFICIENT_SECONDS: "INSUFFICIENT_SECONDS",
  SCHEMA_UNAVAILABLE: "SCHEMA_UNAVAILABLE",
  NOT_FOUND: "NOT_FOUND",
  CONCURRENT_CLAIM: "CONCURRENT_CLAIM",
  INVALID_MODE: "INVALID_MODE",
  NO_SESSION: "NO_SESSION",
  WRONG_MODE: "WRONG_MODE",
  CLAIM_NOT_DUE: "CLAIM_NOT_DUE",
  PRESENCE_STALE: "PRESENCE_STALE",
  PRESENCE_INSUFFICIENT: "PRESENCE_INSUFFICIENT",
  SESSION_PAUSED: "SESSION_PAUSED",
  DAILY_LIMIT: "DAILY_LIMIT",
  ALREADY_CLAIMED: "ALREADY_CLAIMED",
  NOT_CLICKED: "NOT_CLICKED",
  CLICK_TOO_FAST: "CLICK_TOO_FAST",
  IMPRESSION_EXPIRED: "IMPRESSION_EXPIRED",
} as const;
