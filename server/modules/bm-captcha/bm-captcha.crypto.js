import crypto from "node:crypto";
import { bmCaptchaHmacSecret } from "./bm-captcha.config.js";
export function randomId(bytes = 18) {
    return crypto.randomBytes(bytes).toString("base64url");
}
export function hmacHex(payload) {
    const secret = bmCaptchaHmacSecret();
    if (!secret)
        throw new Error("BM_CAPTCHA_HMAC_SECRET_MISSING");
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
export function timingSafeEqualHex(a, b) {
    try {
        const ab = Buffer.from(a, "utf8");
        const bb = Buffer.from(b, "utf8");
        if (ab.length !== bb.length)
            return false;
        return crypto.timingSafeEqual(ab, bb);
    }
    catch {
        return false;
    }
}
/** Circular angle distance in [0, 180]. */
export function angleDeltaDeg(a, b) {
    const d = Math.abs(((a % 360) + 360) % 360 - (((b % 360) + 360) % 360));
    return Math.min(d, 360 - d);
}
/**
 * Incremental PoW: find counter such that sha256(`${prefix}:${counter}`) starts with
 * `difficulty` zero hex chars. Client does the work; server verifies once.
 */
export function verifyPow(prefix, counter, difficulty) {
    if (difficulty <= 0)
        return true;
    if (!Number.isFinite(counter) || counter < 0 || counter > 50_000_000)
        return false;
    const hash = crypto.createHash("sha256").update(`${prefix}:${Math.floor(counter)}`).digest("hex");
    return hash.startsWith("0".repeat(difficulty));
}
export function powPrefixForChallenge(challengeId, userId) {
    return hmacHex(`pow|${userId}|${challengeId}`).slice(0, 24);
}
