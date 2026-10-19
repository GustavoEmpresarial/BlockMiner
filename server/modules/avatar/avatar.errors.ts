/** Stable codes for the profile-photo license and upload flows (HTTP status alongside). */
export const AVATAR_ERRORS = {
  AVATAR_LICENSE_REQUIRED: { status: 403, message: "An active profile photo license is required." },
  AVATAR_CURRENCY_NOT_ALLOWED: { status: 400, message: "This currency cannot be used for the license." },
  AVATAR_PRICE_UNAVAILABLE: { status: 503, message: "Price is temporarily unavailable. Try again in a minute." },
  AVATAR_QUOTE_CHANGED: { status: 409, message: "The price changed. Review the new amount and try again." },
  AVATAR_INSUFFICIENT_BALANCE: { status: 400, message: "Insufficient balance." },
  AVATAR_LICENSE_ALREADY_ACTIVE: { status: 409, message: "Your license is still active. You can renew it in the last 30 days." },
  AVATAR_IDEMPOTENCY_KEY_INVALID: { status: 400, message: "Missing or invalid Idempotency-Key header." },
  AVATAR_UPLOAD_INVALID: { status: 400, message: "Send a PNG, JPEG, WebP or GIF image." },
  AVATAR_UPLOAD_TOO_LARGE: { status: 400, message: "Image too large (max 2 MB)." },
  AVATAR_UPLOAD_BLOCKED: { status: 403, message: "Profile photo uploads are blocked for this account." },
  AVATAR_RATE_LIMITED: { status: 429, message: "Too many uploads. Try again later." },
  AVATAR_CERT_NAME_INVALID: { status: 400, message: "Use 2 to 24 letters, numbers, spaces or . ' _ -" },
  AVATAR_CERT_LIMIT_REACHED: { status: 409, message: "No certificate generations left for this license." },
  AVATAR_CERT_BUSY: { status: 429, message: "The certificate is already being generated. Try again shortly." },
  AVATAR_CERT_PROVIDER_FAILED: { status: 502, message: "Certificate generation failed. Try again." },
  AVATAR_CERT_NOT_CONFIGURED: { status: 503, message: "Certificate generation is not available right now." },
} as const;

export type AvatarErrorCode = keyof typeof AVATAR_ERRORS;

export class AvatarError extends Error {
  readonly code: AvatarErrorCode;
  readonly status: number;
  readonly retryAfterSec?: number;
  constructor(code: AvatarErrorCode, opts: { retryAfterSec?: number } = {}) {
    super(AVATAR_ERRORS[code].message);
    this.name = "AvatarError";
    this.code = code;
    this.status = AVATAR_ERRORS[code].status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}
