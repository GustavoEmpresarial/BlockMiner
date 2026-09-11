/**
 * IPHub — https://v2.api.iphub.info/ip/{ip}  (header X-Key)
 * Free basic tier: 1000/day. block 1 = proxy/VPN/hosting; 0 = clean.
 */
import { IPHUB_SOURCE, iphubApiKey, iphubBaseUrl, iphubEnabled, iphubTimeoutMs } from "./ip-intelligence.config.js";
import { parseAsn, sliceString } from "./ip-intelligence.parse.js";
/** Pure parse of IPHub JSON. block>=1 → detected (basic + residential-warning). */
export function parseIphubResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { source: IPHUB_SOURCE, error: "provider_error" };
    }
    const body = payload;
    if (body.block === undefined || body.block === null) {
        return { source: IPHUB_SOURCE, error: "provider_error" };
    }
    const block = Number(body.block);
    if (![0, 1, 2].includes(block)) {
        return { source: IPHUB_SOURCE, error: "provider_error" };
    }
    const proxyDetected = block >= 1;
    const proxyType = block === 2 ? "proxy" : block === 1 ? "proxy" : null;
    const org = sliceString(body.isp, 255);
    return {
        source: IPHUB_SOURCE,
        proxyDetected,
        proxyType,
        proxyRiskScore: block === 0 ? 0 : block === 1 ? 80 : 60,
        proxyProvider: org,
        proxyLastSeenAt: null,
        asn: parseAsn(body.asn),
        asnOrg: org,
        error: null,
    };
}
export async function lookupIphub(ip, { fetchImpl = globalThis.fetch } = {}) {
    if (!iphubEnabled() || typeof fetchImpl !== "function") {
        return { source: IPHUB_SOURCE, error: "provider_not_configured" };
    }
    try {
        const base = iphubBaseUrl().replace(/\/+$/, "");
        const res = await fetchImpl(`${base}/ip/${encodeURIComponent(ip)}`, {
            headers: { "X-Key": iphubApiKey(), Accept: "application/json" },
            signal: AbortSignal.timeout(iphubTimeoutMs()),
        });
        if (!res.ok)
            return { source: IPHUB_SOURCE, error: "provider_error" };
        const payload = await res.json();
        return parseIphubResponse(payload);
    }
    catch {
        return { source: IPHUB_SOURCE, error: "provider_error" };
    }
}
