/**
 * ipapi.is — https://api.ipapi.is/?q={ip}&key=
 * Free account: 1000/day with full is_vpn / is_proxy / is_tor flags.
 */
import { IPAPIIS_SOURCE, ipapiisApiKey, ipapiisBaseUrl, ipapiisEnabled, ipapiisTimeoutMs } from "./ip-intelligence.config.js";
import { asBool, parseAsn, sliceString, typeFromFlags } from "./ip-intelligence.parse.js";
/** Pure parse — requires keyed response fields (anonymous tier drops vpn flags). */
export function parseIpapiisResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { source: IPAPIIS_SOURCE, error: "provider_error" };
    }
    const body = payload;
    if (body.error || (body.message && body.is_vpn === undefined && body.is_proxy === undefined)) {
        return { source: IPAPIIS_SOURCE, error: "provider_error" };
    }
    if (body.is_vpn === undefined && body.is_proxy === undefined && body.is_tor === undefined) {
        // Anonymous minimal payload — cannot produce an honest proxy verdict.
        return { source: IPAPIIS_SOURCE, error: "provider_error" };
    }
    const vpn = asBool(body.is_vpn);
    const proxy = asBool(body.is_proxy);
    const tor = asBool(body.is_tor);
    const proxyDetected = vpn || proxy || tor;
    const org = sliceString(body.asn_org || body.company_name || body.company, 255);
    return {
        source: IPAPIIS_SOURCE,
        proxyDetected,
        proxyType: proxyDetected ? typeFromFlags({ tor, vpn, proxy }) : null,
        proxyRiskScore: null,
        proxyProvider: org,
        proxyLastSeenAt: null,
        asn: parseAsn(body.asn_num ?? body.asn),
        asnOrg: org,
        error: null,
    };
}
export async function lookupIpapiis(ip, { fetchImpl = globalThis.fetch } = {}) {
    if (!ipapiisEnabled() || typeof fetchImpl !== "function") {
        return { source: IPAPIIS_SOURCE, error: "provider_not_configured" };
    }
    try {
        const base = ipapiisBaseUrl().replace(/\/+$/, "");
        const params = new URLSearchParams({ q: ip, key: ipapiisApiKey() });
        const res = await fetchImpl(`${base}/?${params.toString()}`, {
            signal: AbortSignal.timeout(ipapiisTimeoutMs()),
        });
        if (!res.ok)
            return { source: IPAPIIS_SOURCE, error: "provider_error" };
        const payload = await res.json();
        return parseIpapiisResponse(payload);
    }
    catch {
        return { source: IPAPIIS_SOURCE, error: "provider_error" };
    }
}
