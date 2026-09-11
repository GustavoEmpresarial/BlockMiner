/**
 * VPN Blocker — https://api.vpnblocker.net/v2/json/{ip}
 * Free package: no key required (~500/month). host-ip = VPN/proxy/hosting org.
 */
import { VPNBLOCKER_SOURCE, vpnblockerApiKey, vpnblockerBaseUrl, vpnblockerEnabled, vpnblockerTimeoutMs, } from "./ip-intelligence.config.js";
import { asBool, sliceString } from "./ip-intelligence.parse.js";
/** Pure parse — host-ip alone is hosting/VPN/proxy org; only treat as proxy when org looks VPN/Tor/proxy. */
export function parseVpnblockerResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { source: VPNBLOCKER_SOURCE, error: "provider_error" };
    }
    const body = payload;
    if (String(body.status || "").toLowerCase() === "failed" || body.msg) {
        return { source: VPNBLOCKER_SOURCE, error: "provider_error" };
    }
    const hostIp = body["host-ip"] ?? body.host_ip;
    if (hostIp === undefined || hostIp === null) {
        return { source: VPNBLOCKER_SOURCE, error: "provider_error" };
    }
    const hostIpFlag = asBool(hostIp);
    const org = sliceString(body.org, 255);
    const orgLower = String(org || "").toLowerCase();
    const orgLooksAnonymous = /vpn|\btor\b|proxy|anonymizer|\bwarp\b/.test(orgLower);
    // Datacenter/hosting (AWS, CF CDN, etc.) often set host-ip without being a VPN — do not block those alone.
    const proxyDetected = Boolean(hostIpFlag && orgLooksAnonymous);
    const proxyType = proxyDetected
        ? /\btor\b/.test(orgLower)
            ? "tor"
            : /vpn/.test(orgLower)
                ? "vpn"
                : "proxy"
        : null;
    return {
        source: VPNBLOCKER_SOURCE,
        proxyDetected,
        proxyType,
        proxyRiskScore: null,
        proxyProvider: org,
        proxyLastSeenAt: null,
        asn: null,
        asnOrg: org,
        error: null,
    };
}
export async function lookupVpnblocker(ip, { fetchImpl = globalThis.fetch } = {}) {
    if (!vpnblockerEnabled() || typeof fetchImpl !== "function") {
        return { source: VPNBLOCKER_SOURCE, error: "provider_not_configured" };
    }
    try {
        const base = vpnblockerBaseUrl().replace(/\/+$/, "");
        const headers = { Accept: "application/json" };
        const key = vpnblockerApiKey();
        if (key)
            headers["X-API-KEY"] = key;
        const res = await fetchImpl(`${base}/json/${encodeURIComponent(ip)}`, {
            headers,
            signal: AbortSignal.timeout(vpnblockerTimeoutMs()),
        });
        if (!res.ok)
            return { source: VPNBLOCKER_SOURCE, error: "provider_error" };
        const payload = await res.json();
        return parseVpnblockerResponse(payload);
    }
    catch {
        return { source: VPNBLOCKER_SOURCE, error: "provider_error" };
    }
}
