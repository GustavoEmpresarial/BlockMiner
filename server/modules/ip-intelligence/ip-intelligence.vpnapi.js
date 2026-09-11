/**
 * VPNAPI.io client — https://vpnapi.io/api/{ip}?key=
 * Detects vpn / proxy / tor / relay. No network call when unconfigured.
 */
import { VPNAPI_SOURCE, vpnapiApiKey, vpnapiBaseUrl, vpnapiEnabled, vpnapiTimeoutMs } from "./ip-intelligence.config.js";
function parseAsn(value) {
    const match = String(value ?? "").trim().match(/AS?(\d+)/i);
    if (!match)
        return null;
    const n = Number(match[1]);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function asBool(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}
/** Pure parse of the documented VPNAPI JSON — unit-testable without HTTP. */
export function parseVpnapiResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { source: VPNAPI_SOURCE, error: "provider_error" };
    }
    const body = payload;
    if (body.message && !body.security) {
        return { source: VPNAPI_SOURCE, error: "provider_error" };
    }
    const security = body.security;
    if (!security || typeof security !== "object") {
        return { source: VPNAPI_SOURCE, error: "provider_error" };
    }
    const vpn = asBool(security.vpn);
    const proxy = asBool(security.proxy);
    const tor = asBool(security.tor);
    const relay = asBool(security.relay);
    const proxyDetected = vpn || proxy || tor || relay;
    const proxyType = tor ? "tor" : vpn ? "vpn" : proxy ? "proxy" : relay ? "relay" : null;
    const org = String(body.network?.autonomous_system_organization || "").trim();
    return {
        source: VPNAPI_SOURCE,
        proxyDetected,
        proxyType,
        proxyRiskScore: null,
        proxyProvider: org ? org.slice(0, 255) : null,
        proxyLastSeenAt: null,
        asn: parseAsn(body.network?.autonomous_system_number),
        asnOrg: org ? org.slice(0, 255) : null,
        error: null,
    };
}
export async function lookupVpnapi(ip, { fetchImpl = globalThis.fetch } = {}) {
    if (!vpnapiEnabled() || typeof fetchImpl !== "function") {
        return { source: VPNAPI_SOURCE, error: "provider_not_configured" };
    }
    try {
        const base = vpnapiBaseUrl().replace(/\/+$/, "");
        const url = `${base}/${encodeURIComponent(ip)}?key=${encodeURIComponent(vpnapiApiKey())}`;
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(vpnapiTimeoutMs()) });
        if (!res.ok)
            return { source: VPNAPI_SOURCE, error: "provider_error" };
        const payload = await res.json();
        return parseVpnapiResponse(payload);
    }
    catch {
        return { source: VPNAPI_SOURCE, error: "provider_error" };
    }
}
