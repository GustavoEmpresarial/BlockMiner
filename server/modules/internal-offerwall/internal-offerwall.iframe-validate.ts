// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported verbatim from legacy/server/modules/internal-offerwall/internal-offerwall.iframe-validate.ts. */
export function hostMatchesIframeAllowlist(host, allowedHosts) {
    const h = String(host || "").toLowerCase();
    if (!h)
        return false;
    if (allowedHosts.has(h))
        return true;
    for (const entry of allowedHosts) {
        const e = String(entry || "").toLowerCase();
        if (!e)
            continue;
        if (h === e)
            return true;
        if (h.endsWith("." + e))
            return true;
    }
    return false;
}
export function expandCspFrameSrcHostSources(allowedHosts) {
    const out = [];
    const seen = new Set();
    for (const h of allowedHosts) {
        const host = String(h || "").trim().toLowerCase();
        if (!host)
            continue;
        if (host.includes(":"))
            continue;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
            const direct = `https://${host}`;
            if (!seen.has(direct)) {
                seen.add(direct);
                out.push(direct);
            }
            continue;
        }
        const direct = `https://${host}`;
        if (!seen.has(direct)) {
            seen.add(direct);
            out.push(direct);
        }
        const wild = `https://*.${host}`;
        if (!seen.has(wild)) {
            seen.add(wild);
            out.push(wild);
        }
    }
    return out;
}
export function validateIframeUrl(rawUrl, { allowHttp, allowedHosts }) {
    const trimmed = String(rawUrl || "").trim();
    let parsed;
    if (!trimmed) {
        return { ok: false, code: "IFRAME_URL_REQUIRED", message: "Iframe URL is required for PTC offers." };
    }
    if (trimmed.length > 2048) {
        return { ok: false, code: "IFRAME_URL_TOO_LONG", message: "Iframe URL is too long." };
    }
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return { ok: false, code: "IFRAME_URL_INVALID", message: "Iframe URL is not a valid URL." };
    }
    const proto = parsed.protocol.replace(":", "").toLowerCase();
    if (proto === "https") {
        // ok
    }
    else if (proto === "http" && allowHttp) {
        // ok (dev / test VM only)
    }
    else {
        return { ok: false, code: "IFRAME_URL_SCHEME", message: "Only https URLs are allowed for iframe content." };
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || host === "localhost") {
        return { ok: false, code: "IFRAME_URL_HOST", message: "Invalid iframe host." };
    }
    if (!hostMatchesIframeAllowlist(host, allowedHosts)) {
        return {
            ok: false,
            code: "IFRAME_URL_NOT_ALLOWED",
            host,
            message: "Iframe host is not on the allowlist (refresh the allowlist cache or save the offer again to register the host).",
        };
    }
    return { ok: true, url: parsed.toString() };
}
export function isAllowHttpIframe() {
    const v = String(process.env.INTERNAL_OFFERWALL_ALLOW_HTTP_IFRAME || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}
