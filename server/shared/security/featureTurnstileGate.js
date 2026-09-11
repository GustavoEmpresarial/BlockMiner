/**
 * Cloudflare Turnstile gate for feature entry points
 * (youtube / faucet / shortlink / automining).
 *
 * Page-entry captcha every visit (reload / re-open). No time-based TTL.
 * Solving grants a one-shot server pass consumed by the gated start/claim action.
 */
import { isTurnstileEnforced, resolveTurnstileSecret, verifyTurnstileToken, } from "./turnstile.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("feature.turnstile");
export const FEATURE_TURNSTILE_PURPOSES = ["youtube", "faucet", "shortlink", "automining"];
function envFlag(name, fallbackTrue) {
    const raw = String(process.env[name] ?? "").trim().toLowerCase();
    if (!raw)
        return fallbackTrue;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
/** Master switch — default on whenever Turnstile secret exists. */
export function featureTurnstileEnabled() {
    if (!isTurnstileEnforced())
        return false;
    return envFlag("FEATURE_TURNSTILE_ENABLED", true);
}
export function isFeatureTurnstilePurpose(raw) {
    return FEATURE_TURNSTILE_PURPOSES.includes(String(raw ?? ""));
}
/** One-shot unlock after page-entry captcha — consumed on first gated action. */
const oneShotPasses = new Set();
function key(purpose, userId) {
    return `${purpose}:${userId}`;
}
export function hasFeatureTurnstilePass(purpose, userId) {
    return oneShotPasses.has(key(purpose, userId));
}
export function grantFeatureTurnstilePass(purpose, userId) {
    oneShotPasses.add(key(purpose, userId));
}
export function consumeFeatureTurnstilePass(purpose, userId) {
    const k = key(purpose, userId);
    if (!oneShotPasses.has(k))
        return false;
    oneShotPasses.delete(k);
    return true;
}
export function clearFeatureTurnstilePass(purpose, userId) {
    oneShotPasses.delete(key(purpose, userId));
}
export function getFeatureTurnstileStatus(purpose, userId, opts) {
    const active = featureTurnstileEnabled();
    if (opts?.invalidate) {
        clearFeatureTurnstilePass(purpose, userId);
    }
    return {
        active,
        purpose,
        required: active,
        hasPass: hasFeatureTurnstilePass(purpose, userId),
    };
}
export async function submitFeatureTurnstilePass(purpose, userId, cfTurnstileToken, remoteIp) {
    if (!featureTurnstileEnabled())
        return { ok: false, code: "GATE_INACTIVE" };
    const secret = resolveTurnstileSecret();
    const result = await verifyTurnstileToken(cfTurnstileToken, remoteIp, { secret });
    if (!result.ok)
        return { ok: false, code: result.code };
    grantFeatureTurnstilePass(purpose, userId);
    log.info("feature_turnstile_pass_granted", { purpose, userId });
    return { ok: true };
}
/**
 * Require a verified Turnstile token or a page-entry one-shot pass.
 * Does not consume the pass (same visit can start/claim more than once).
 * Pass is cleared on the next page visit via status?invalidate=1.
 */
export async function assertFeatureTurnstile(purpose, userId, cfTurnstileToken, remoteIp) {
    if (!featureTurnstileEnabled())
        return { ok: true };
    if (hasFeatureTurnstilePass(purpose, userId))
        return { ok: true };
    const token = typeof cfTurnstileToken === "string" ? cfTurnstileToken.trim() : "";
    if (token) {
        const secret = resolveTurnstileSecret();
        const result = await verifyTurnstileToken(token, remoteIp, { secret });
        if (result.ok) {
            grantFeatureTurnstilePass(purpose, userId);
            return { ok: true };
        }
        log.warn("feature_turnstile_blocked", { purpose, userId, code: result.code });
        return { ok: false, code: result.code };
    }
    log.warn("feature_turnstile_blocked", { purpose, userId, code: "CAPTCHA_REQUIRED" });
    return { ok: false, code: "CAPTCHA_REQUIRED" };
}
export function featureTurnstileDenyBody(code) {
    return {
        ok: false,
        code,
        captchaRequired: true,
        message: code === "CAPTCHA_FAILED"
            ? "Human verification failed. Please try again."
            : "Human verification is required before continuing.",
    };
}
