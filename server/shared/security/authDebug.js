import { logger } from "../../core/logger/index.js";
import { BUILTIN_CORS_ORIGINS } from "../http/corsConfig.js";
const log = logger.child("AuthDebug");
const PARTNER_HOST_SUFFIXES = BUILTIN_CORS_ORIGINS.map((origin) => {
    try {
        return new URL(origin).hostname.replace(/^www\./, "");
    }
    catch {
        return "";
    }
}).filter(Boolean);
function envFlag(name) {
    const raw = String(process.env[name] ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
function enabled() {
    return envFlag("AUTH_DEBUG_LOG");
}
function tryHostnameFromUrl(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return undefined;
    try {
        return new URL(trimmed).hostname.replace(/^www\./, "").toLowerCase();
    }
    catch {
        return undefined;
    }
}
function hostMatchesPartner(hostname) {
    if (!hostname)
        return false;
    const host = hostname.replace(/^www\./, "").toLowerCase();
    return PARTNER_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
function resolvedAuthCookieSameSite() {
    const raw = String(process.env.AUTH_COOKIE_SAMESITE || "").trim().toLowerCase();
    if (raw === "lax" || raw === "strict" || raw === "none")
        return raw;
    return "lax(default)";
}
function resolvedCsrfCookieSameSite() {
    const raw = String(process.env.CSRF_COOKIE_SAMESITE || "").trim().toLowerCase();
    if (raw === "lax" || raw === "strict" || raw === "none")
        return raw;
    return process.env.NODE_ENV === "production" ? "strict(default)" : "lax(default)";
}
function identifierHints(identifier) {
    const value = String(identifier ?? "").trim();
    if (!value)
        return { identifierPresent: false };
    const at = value.indexOf("@");
    return {
        identifierPresent: true,
        identifierLength: value.length,
        identifierHasAt: at >= 0,
        identifierDomain: at >= 0 ? value.slice(at + 1).toLowerCase() : undefined,
    };
}
/** Request metadata useful when debugging partner iframe login (no secrets). */
export function buildAuthRequestContext(req, extra = {}) {
    const origin = String(req.headers.origin ?? "").trim();
    const referer = String(req.headers.referer ?? "").trim();
    const originHost = tryHostnameFromUrl(origin);
    const refererHost = tryHostnameFromUrl(referer);
    const secFetchDest = String(req.headers["sec-fetch-dest"] ?? "").trim();
    const secFetchSite = String(req.headers["sec-fetch-site"] ?? "").trim();
    const secFetchMode = String(req.headers["sec-fetch-mode"] ?? "").trim();
    const cookies = String(req.headers.cookie ?? "");
    const partnerContext = hostMatchesPartner(originHost) || hostMatchesPartner(refererHost);
    const iframeContext = secFetchDest === "iframe" ||
        secFetchSite === "cross-site" ||
        (partnerContext && secFetchMode === "navigate");
    return {
        path: req.originalUrl || req.url,
        method: req.method,
        userId: req.user?.id ?? null,
        origin: origin || undefined,
        originHost,
        refererHost,
        secFetchDest: secFetchDest || undefined,
        secFetchSite: secFetchSite || undefined,
        secFetchMode: secFetchMode || undefined,
        iframeContext,
        partnerContext,
        hasAccessCookie: cookies.includes("blockminer_access=") || cookies.includes("blockminer_session="),
        hasRefreshCookie: cookies.includes("blockminer_refresh="),
        hasCsrfCookie: cookies.includes("blockminer_csrf="),
        hasCsrfHeader: Boolean(req.headers["x-csrf-token"]),
        authCookieSameSite: resolvedAuthCookieSameSite(),
        csrfCookieSameSite: resolvedCsrfCookieSameSite(),
        ...extra,
    };
}
function shouldTrace(ctx) {
    return enabled() || ctx.iframeContext === true || ctx.partnerContext === true;
}
/** General auth diagnostics — gated by AUTH_DEBUG_LOG unless partner/iframe context. */
export function authDebug(event, req, details = {}) {
    const ctx = buildAuthRequestContext(req, details);
    if (!shouldTrace(ctx))
        return;
    log.info(event, ctx, req);
}
/** Login-specific trace — always logs partner/iframe attempts; full detail when AUTH_DEBUG_LOG=1. */
export function authLoginTrace(event, req, details = {}, identifier) {
    const ctx = buildAuthRequestContext(req, {
        ...identifierHints(identifier),
        ...details,
    });
    if (!shouldTrace(ctx))
        return;
    log.info(event, ctx, req);
}
