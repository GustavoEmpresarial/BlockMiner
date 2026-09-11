// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Cookie construction for auth/admin sessions — the security boundary for
 * admin access and session handling. Ported from legacy auth.security.ts.
 */
import crypto from "node:crypto";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "./token.js";
import { verifyAccessToken } from "./authTokens.js";
function authCookieSameSite() {
    const raw = String(process.env.AUTH_COOKIE_SAMESITE || "").trim().toLowerCase();
    if (raw === "lax")
        return "Lax";
    if (raw === "strict")
        return "Strict";
    if (raw === "none")
        return "None";
    return "Lax";
}
function appendPartitionedIfNeeded(parts, sameSite) {
    if (sameSite === "None")
        parts.push("Partitioned");
}
export function buildCookie(name, value, maxAgeSeconds) {
    const sameSite = authCookieSameSite();
    const parts = [`${name}=${encodeURIComponent(value)}`, `Max-Age=${maxAgeSeconds}`, "Path=/", "HttpOnly", `SameSite=${sameSite}`];
    if (process.env.NODE_ENV === "production" || sameSite === "None")
        parts.push("Secure");
    appendPartitionedIfNeeded(parts, sameSite);
    return parts.join("; ");
}
export function buildAccessCookie(accessToken) {
    const decoded = verifyAccessToken(accessToken);
    const payload = typeof decoded === "string" || decoded == null ? null : decoded;
    const expSeconds = Number(payload?.exp ?? 0);
    const maxAgeSeconds = Math.max(0, expSeconds - Math.floor(Date.now() / 1000));
    return buildCookie(ACCESS_COOKIE_NAME, accessToken, maxAgeSeconds);
}
export function buildRefreshCookie(refreshToken, expiresAt) {
    const maxAgeSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return buildCookie(REFRESH_COOKIE_NAME, refreshToken, maxAgeSeconds);
}
export function clearAuthCookies() {
    return [buildCookie(ACCESS_COOKIE_NAME, "", 0), buildCookie(REFRESH_COOKIE_NAME, "", 0)];
}
export function clearAccessCookieOnly() {
    return buildCookie(ACCESS_COOKIE_NAME, "", 0);
}
/**
 * `res.setHeader("Set-Cookie", ...)` REPLACES any Set-Cookie already on the response — a real
 * bug when the global CSRF middleware (server/core/http/middleware/csrf.ts) has already attached
 * its own Set-Cookie earlier in the same request (e.g. first-load `GET /auth/session` when no
 * CSRF cookie exists yet: the middleware sets it, then a raw `setHeader` call further down the
 * chain silently wiped it out, so the browser never received it). Always append through this
 * helper instead of calling `res.setHeader("Set-Cookie", ...)` directly.
 */
export function appendSetCookie(res, cookieValue) {
    const existing = res.getHeader("Set-Cookie");
    const existingList = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
    const nextList = Array.isArray(cookieValue) ? cookieValue : [cookieValue];
    res.setHeader("Set-Cookie", [...existingList, ...nextList]);
}
export function timingSafeAdminSecretEqual(supplied, expectedFromEnv) {
    const exp = String(expectedFromEnv ?? "");
    if (!exp)
        return false;
    const left = crypto.createHash("sha256").update(String(supplied ?? ""), "utf8").digest();
    const right = crypto.createHash("sha256").update(exp, "utf8").digest();
    return crypto.timingSafeEqual(left, right);
}
