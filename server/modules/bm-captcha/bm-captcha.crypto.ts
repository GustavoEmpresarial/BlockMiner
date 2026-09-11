import crypto from "node:crypto";
import { bmCaptchaHmacSecret } from "./bm-captcha.config.js";

export function randomId(bytes = 18): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hmacHex(payload: string): string {
  const secret = bmCaptchaHmacSecret();
  if (!secret) throw new Error("BM_CAPTCHA_HMAC_SECRET_MISSING");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Circular angle distance in [0, 180]. */
export function angleDeltaDeg(a: number, b: number): number {
  const d = Math.abs(((a % 360) + 360) % 360 - (((b % 360) + 360) % 360));
  return Math.min(d, 360 - d);
}

/**
 * Incremental PoW: find counter such that sha256(`${prefix}:${counter}`) starts with
 * `difficulty` zero hex chars. Client does the work; server verifies once.
 */
export function verifyPow(prefix: string, counter: number, difficulty: number): boolean {
  if (difficulty <= 0) return true;
  if (!Number.isFinite(counter) || counter < 0 || counter > 50_000_000) return false;
  const hash = crypto.createHash("sha256").update(`${prefix}:${Math.floor(counter)}`).digest("hex");
  return hash.startsWith("0".repeat(difficulty));
}

export function powPrefixForChallenge(challengeId: string, userId: number): string {
  return hmacHex(`pow|${userId}|${challengeId}`).slice(0, 24);
}
