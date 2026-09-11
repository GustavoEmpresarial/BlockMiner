/**
 * AbstractAPI IP Intelligence — https://ip-intelligence.abstractapi.com/v1/
 * Free tier: 1000/month. Flags: is_vpn / is_proxy / is_tor / is_relay.
 */
import { ABSTRACTAPI_SOURCE, abstractapiApiKey, abstractapiBaseUrl, abstractapiEnabled, abstractapiTimeoutMs, } from "./ip-intelligence.config.js";
import { asBool, parseAsn, sliceString, typeFromFlags } from "./ip-intelligence.parse.js";
/** Pure parse of Abstract IP Intelligence JSON. */
export function parseAbstractapiResponse(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return { source: ABSTRACTAPI_SOURCE, error: "provider_error" };
    }
    const body = payload;
    if (body.error || !body.security || typeof body.security !== "object") {
        return { source: ABSTRACTAPI_SOURCE, error: "provider_error" };
    }
    const sec = body.security;
    const vpn = asBool(sec.is_vpn);
    const proxy = asBool(sec.is_proxy);
    const tor = asBool(sec.is_tor);
    const relay = asBool(sec.is_relay);
    const proxyDetected = vpn || proxy || tor || relay;
    const conn = body.connection && typeof body.connection === "object" ? body.connection : {};
    const org = sliceString(conn.organization_name || conn.isp_name, 255);
    return {
        source: ABSTRACTAPI_SOURCE,
        proxyDetected,
        proxyType: proxyDetected ? typeFromFlags({ tor, vpn, proxy, relay }) : null,
        proxyRiskScore: null,
        proxyProvider: org,
        proxyLastSeenAt: null,
        asn: parseAsn(conn.asn),
        asnOrg: org,
        error: null,
    };
}
export async function lookupAbstractapi(ip, { fetchImpl = globalThis.fetch } = {}) {
    if (!abstractapiEnabled() || typeof fetchImpl !== "function") {
        return { source: ABSTRACTAPI_SOURCE, error: "provider_not_configured" };
    }
    try {
        const base = abstractapiBaseUrl().replace(/\/+$/, "");
        const params = new URLSearchParams({
            api_key: abstractapiApiKey(),
            ip_address: ip,
        });
        const res = await fetchImpl(`${base}/?${params.toString()}`, {
            signal: AbortSignal.timeout(abstractapiTimeoutMs()),
        });
        if (!res.ok)
            return { source: ABSTRACTAPI_SOURCE, error: "provider_error" };
        const payload = await res.json();
        return parseAbstractapiResponse(payload);
    }
    catch {
        return { source: ABSTRACTAPI_SOURCE, error: "provider_error" };
    }
}
