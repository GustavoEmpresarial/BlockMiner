/**
 * Multi-provider VPN/proxy lookup. Each provider degrades honestly when
 * unconfigured — no network call, no fabricated verdict.
 */
import { ABSTRACTAPI_SOURCE, GETIPINTEL_SOURCE, IPAPIIS_SOURCE, IPHUB_SOURCE, IPLOGS_SOURCE, IPQS_SOURCE, PROXYCHECK_SOURCE, PROXY_TYPE_PRIORITY, VPNAPI_SOURCE, VPNBLOCKER_SOURCE, abstractapiDailyLimit, abstractapiEnabled, abstractapiTimeoutMs, abstractapiTtlHours, getipintelDailyLimit, getipintelEnabled, getipintelTimeoutMs, getipintelTtlHours, ipapiisDailyLimit, ipapiisEnabled, ipapiisTimeoutMs, ipapiisTtlHours, iphubDailyLimit, iphubEnabled, iphubTimeoutMs, iphubTtlHours, iplogsDailyLimit, iplogsEnabled, iplogsTimeoutMs, iplogsTtlHours, ipqsDailyLimit, ipqsEnabled, ipqsTimeoutMs, ipqsTtlHours, ipIntelProxyMinHits, proxycheckDailyLimit, proxycheckEnabled, proxycheckTimeoutMs, proxycheckTtlHours, vpnapiDailyLimit, vpnapiEnabled, vpnapiTimeoutMs, vpnapiTtlHours, vpnblockerDailyLimit, vpnblockerEnabled, vpnblockerTimeoutMs, vpnblockerTtlHours, } from "./ip-intelligence.config.js";
import { lookupAbstractapi } from "./ip-intelligence.abstractapi.js";
import { lookupGetipintel } from "./ip-intelligence.getipintel.js";
import { lookupIpapiis } from "./ip-intelligence.ipapiis.js";
import { lookupIphub } from "./ip-intelligence.iphub.js";
import { lookupIplogs } from "./ip-intelligence.iplogs.js";
import { lookupIpqs } from "./ip-intelligence.ipqs.js";
import { lookupProxycheck } from "./ip-intelligence.proxycheck.js";
import { lookupVpnapi } from "./ip-intelligence.vpnapi.js";
import { lookupVpnblocker } from "./ip-intelligence.vpnblocker.js";
/** Free/freemium anti-proxy providers — OR-merge (any true wins). */
export const PROXY_PROVIDERS = [
    {
        id: PROXYCHECK_SOURCE,
        enabled: proxycheckEnabled,
        dailyLimit: proxycheckDailyLimit,
        ttlHours: proxycheckTtlHours,
        timeoutMs: proxycheckTimeoutMs,
        lookup: lookupProxycheck,
    },
    {
        id: VPNAPI_SOURCE,
        enabled: vpnapiEnabled,
        dailyLimit: vpnapiDailyLimit,
        ttlHours: vpnapiTtlHours,
        timeoutMs: vpnapiTimeoutMs,
        lookup: lookupVpnapi,
    },
    {
        id: GETIPINTEL_SOURCE,
        enabled: getipintelEnabled,
        dailyLimit: getipintelDailyLimit,
        ttlHours: getipintelTtlHours,
        timeoutMs: getipintelTimeoutMs,
        lookup: lookupGetipintel,
    },
    {
        id: IPLOGS_SOURCE,
        enabled: iplogsEnabled,
        dailyLimit: iplogsDailyLimit,
        ttlHours: iplogsTtlHours,
        timeoutMs: iplogsTimeoutMs,
        lookup: lookupIplogs,
    },
    {
        id: IPAPIIS_SOURCE,
        enabled: ipapiisEnabled,
        dailyLimit: ipapiisDailyLimit,
        ttlHours: ipapiisTtlHours,
        timeoutMs: ipapiisTimeoutMs,
        lookup: lookupIpapiis,
    },
    {
        id: IPHUB_SOURCE,
        enabled: iphubEnabled,
        dailyLimit: iphubDailyLimit,
        ttlHours: iphubTtlHours,
        timeoutMs: iphubTimeoutMs,
        lookup: lookupIphub,
    },
    {
        id: IPQS_SOURCE,
        enabled: ipqsEnabled,
        dailyLimit: ipqsDailyLimit,
        ttlHours: ipqsTtlHours,
        timeoutMs: ipqsTimeoutMs,
        lookup: lookupIpqs,
    },
    {
        id: VPNBLOCKER_SOURCE,
        enabled: vpnblockerEnabled,
        dailyLimit: vpnblockerDailyLimit,
        ttlHours: vpnblockerTtlHours,
        timeoutMs: vpnblockerTimeoutMs,
        lookup: lookupVpnblocker,
    },
    {
        id: ABSTRACTAPI_SOURCE,
        enabled: abstractapiEnabled,
        dailyLimit: abstractapiDailyLimit,
        ttlHours: abstractapiTtlHours,
        timeoutMs: abstractapiTimeoutMs,
        lookup: lookupAbstractapi,
    },
];
export function listEnabledProxyProviders() {
    return PROXY_PROVIDERS.filter((p) => p.enabled());
}
export function parseProxySources(raw) {
    return String(raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
export function joinProxySources(sources) {
    const unique = [...new Set(sources.map((s) => s.trim()).filter(Boolean))];
    return unique.length ? unique.join(",") : null;
}
function typeRank(type) {
    const idx = PROXY_TYPE_PRIORITY.indexOf(String(type || "").toLowerCase());
    return idx === -1 ? PROXY_TYPE_PRIORITY.length : idx;
}
export function mergeProxyLookups(results) {
    const ok = results.filter((r) => !r.error);
    const sources = ok.map((r) => r.source);
    const trueHits = ok.filter((r) => r.proxyDetected === true);
    const answered = ok.filter((r) => typeof r.proxyDetected === "boolean");
    // Tor from any provider is high-confidence — always treat as detected.
    const torHit = trueHits.some((r) => String(r.proxyType || "").toLowerCase() === "tor");
    const configuredMin = ipIntelProxyMinHits();
    // With only one boolean answer, trust it; with several, require consensus floor.
    const effectiveMin = answered.length >= 2 ? configuredMin : 1;
    let proxyDetected;
    if (torHit || trueHits.length >= effectiveMin) {
        proxyDetected = true;
    }
    else if (answered.some((r) => r.proxyDetected === false) && trueHits.length === 0) {
        proxyDetected = false;
    }
    else if (answered.length > 0 && trueHits.length === 0) {
        proxyDetected = false;
    }
    else if (trueHits.length > 0 && trueHits.length < effectiveMin) {
        // Lone dissenting "true" among multiple providers — treat as not detected (FP softener).
        proxyDetected = false;
    }
    const typed = ok
        .map((r) => r.proxyType)
        .filter((t) => Boolean(t))
        .sort((a, b) => typeRank(a) - typeRank(b));
    const scores = ok.map((r) => r.proxyRiskScore).filter((n) => Number.isInteger(n));
    const providers = ok.map((r) => r.proxyProvider).filter((p) => Boolean(p));
    const asns = ok.map((r) => r.asn).filter((n) => Number.isInteger(n) && n > 0);
    const orgs = ok.map((r) => r.asnOrg).filter((p) => Boolean(p));
    const lastSeen = ok
        .map((r) => r.proxyLastSeenAt)
        .filter((d) => d instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];
    const allErrored = results.length > 0 && ok.length === 0;
    return {
        source: joinProxySources(sources) || results[0]?.source || "none",
        proxyDetected,
        // Only surface proxyType when we actually treat the IP as detected (avoid type-only blocks from discarded votes).
        proxyType: proxyDetected === true ? typed[0] ?? null : null,
        proxyRiskScore: scores.length ? Math.max(...scores) : null,
        proxyProvider: providers[0] ?? null,
        proxyLastSeenAt: lastSeen ?? null,
        asn: asns[0] ?? null,
        asnOrg: orgs[0] ?? providers[0] ?? null,
        error: allErrored ? "provider_error" : null,
    };
}
