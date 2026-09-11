// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { parseCorsOriginsList } from "./corsConfig.js";
function tryHostname(raw) {
    if (!raw)
        return null;
    try {
        return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    }
    catch {
        return null;
    }
}
function isPartnerIframeRequest(req) {
    const secFetchDest = String(req.headers["sec-fetch-dest"] ?? "").toLowerCase();
    if (secFetchDest === "iframe")
        return true;
    const allowed = new Set(parseCorsOriginsList().map((origin) => tryHostname(origin)).filter(Boolean));
    const refererHost = tryHostname(String(req.headers.referer ?? ""));
    const originHost = tryHostname(String(req.headers.origin ?? ""));
    if (refererHost && allowed.has(refererHost))
        return true;
    if (originHost && allowed.has(originHost))
        return true;
    return String(req.headers["sec-fetch-site"] ?? "").toLowerCase() === "cross-site";
}
/** Apply on every response — partner iframe assets must be embeddable cross-origin. */
export function createPartnerEmbedHeadersMiddleware() {
    return (req, res, next) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        if (isPartnerIframeRequest(req)) {
            res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
        }
        next();
    };
}
