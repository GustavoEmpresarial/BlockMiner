// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Registration allowlist: major providers + privacy-focused mail (product policy).
 * Domain match is case-insensitive on the host after the final "@".
 */
export const REGISTER_ALLOWED_EMAIL_DOMAINS = new Set([
    "gmail.com",
    "outlook.com",
    "hotmail.com",
    "yahoo.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
    "tuta.com",
    "tutanota.com",
]);
export function registerEmailDomain(email) {
    const s = String(email ?? "").trim();
    const at = s.lastIndexOf("@");
    if (at < 0 || at === s.length - 1)
        return "";
    return s.slice(at + 1).toLowerCase();
}
export function isRegisterAllowedEmailDomain(email) {
    const d = registerEmailDomain(email);
    return d !== "" && REGISTER_ALLOWED_EMAIL_DOMAINS.has(d);
}
