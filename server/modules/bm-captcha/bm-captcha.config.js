/**
 * BM Captcha — env readers (named constants, no ad-hoc magic numbers).
 * Purpose: human gate before external offerwall partner open.
 */
function envFlag(name, fallback = "true") {
    return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}
function envPositiveInt(name, fallback) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw <= 0)
        return fallback;
    return Math.floor(raw);
}
function envNonNegInt(name, fallback) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw < 0)
        return fallback;
    return Math.floor(raw);
}
export function bmCaptchaEnabled() {
    return envFlag("BM_CAPTCHA_ENABLED", "true");
}
export function bmCaptchaHmacSecret() {
    return String(process.env.BM_CAPTCHA_HMAC_SECRET ||
        process.env.SESSION_SECRET ||
        process.env.JWT_SECRET ||
        "").trim();
}
export function bmCaptchaChallengeTtlMs() {
    return envPositiveInt("BM_CAPTCHA_CHALLENGE_TTL_MS", 180_000);
}
export function bmCaptchaPassTtlMs() {
    return envPositiveInt("BM_CAPTCHA_PASS_TTL_MS", 120_000);
}
/** Min time before submit is accepted. */
export function bmCaptchaMinSolveMs() {
    return envNonNegInt("BM_CAPTCHA_MIN_SOLVE_MS", 900);
}
export function bmCaptchaMaxAttempts() {
    return envPositiveInt("BM_CAPTCHA_MAX_ATTEMPTS", 5);
}
export function bmCaptchaPowDifficulty() {
    return envNonNegInt("BM_CAPTCHA_POW_DIFFICULTY", 0);
}
/** Canvas logical size. */
export function bmCaptchaCanvasSize() {
    return envPositiveInt("BM_CAPTCHA_CANVAS_SIZE", 340);
}
/** How many target shapes the user must click (inclusive range via min/max). */
export function bmCaptchaTargetMin() {
    return envPositiveInt("BM_CAPTCHA_TARGET_MIN", 2);
}
export function bmCaptchaTargetMax() {
    return Math.max(bmCaptchaTargetMin(), envPositiveInt("BM_CAPTCHA_TARGET_MAX", 3));
}
/** Decoy count around targets. */
export function bmCaptchaDecoyCount() {
    return envPositiveInt("BM_CAPTCHA_DECOY_COUNT", 6);
}
/** Click hit radius as fraction of canvas (normalized 0–1 coords use absolute px on server). */
export function bmCaptchaHitRadiusPx() {
    return envPositiveInt("BM_CAPTCHA_HIT_RADIUS_PX", 28);
}
/** Reject if clicks arrive faster than this gap (ms) — bot spray. */
export function bmCaptchaMinClickGapMs() {
    return envNonNegInt("BM_CAPTCHA_MIN_CLICK_GAP_MS", 180);
}
export function bmCaptchaMintMaxPerWindow() {
    return envPositiveInt("BM_CAPTCHA_MINT_MAX_PER_WINDOW", 20);
}
export function bmCaptchaMintWindowMs() {
    return envPositiveInt("BM_CAPTCHA_MINT_WINDOW_MS", 60_000);
}
export const BM_CAPTCHA_PURPOSE_OFFERWALL_EXTERNAL = "offerwall_external";
export const BM_CAPTCHA_PROVIDERS = ["zerads", "offerwallme", "moneyrain", "multiwall", "offerwallgg"];
export function isBmCaptchaProvider(v) {
    return typeof v === "string" && BM_CAPTCHA_PROVIDERS.includes(v);
}
