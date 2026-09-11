/**
 * IPQualityScore — https://ipqualityscore.com/api/json/ip/{key}/{ip}
 * Free tier: 1000 lookups/month (soft daily budget via IPQS_DAILY_LIMIT).
 */
import { IPQS_SOURCE, ipqsApiKey, ipqsBaseUrl, ipqsEnabled, ipqsStrictness, ipqsTimeoutMs } from "./ip-intelligence.config.js";
import { asBool, parseAsn, parseRiskScore, sliceString, typeFromFlags } from "./ip-intelligence.parse.js";
import type { ProxyLookupDeps, ProxyLookupResult } from "./ip-intelligence.types.js";

export type IpqsResponse = {
  success?: unknown;
  message?: unknown;
  proxy?: unknown;
  vpn?: unknown;
  tor?: unknown;
  active_vpn?: unknown;
  active_tor?: unknown;
  fraud_score?: unknown;
  ISP?: unknown;
  organization?: unknown;
  ASN?: unknown;
  recent_abuse?: unknown;
};

/** Pure parse of IPQS proxy-detection JSON. */
export function parseIpqsResponse(payload: unknown): ProxyLookupResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { source: IPQS_SOURCE, error: "provider_error" };
  }
  const body = payload as IpqsResponse;
  if (body.success === false) {
    return { source: IPQS_SOURCE, error: "provider_error" };
  }
  if (body.proxy === undefined && body.vpn === undefined && body.tor === undefined) {
    return { source: IPQS_SOURCE, error: "provider_error" };
  }
  const tor = asBool(body.tor) || asBool(body.active_tor);
  const vpn = asBool(body.vpn) || asBool(body.active_vpn);
  const proxy = asBool(body.proxy);
  const proxyDetected = tor || vpn || proxy;
  const org = sliceString(body.organization || body.ISP, 255);
  return {
    source: IPQS_SOURCE,
    proxyDetected,
    proxyType: proxyDetected ? typeFromFlags({ tor, vpn, proxy }) : null,
    proxyRiskScore: parseRiskScore(body.fraud_score),
    proxyProvider: org,
    proxyLastSeenAt: null,
    asn: parseAsn(body.ASN),
    asnOrg: org,
    error: null,
  };
}

export async function lookupIpqs(ip: string, { fetchImpl = globalThis.fetch }: ProxyLookupDeps = {}): Promise<ProxyLookupResult> {
  if (!ipqsEnabled() || typeof fetchImpl !== "function") {
    return { source: IPQS_SOURCE, error: "provider_not_configured" };
  }
  try {
    const base = ipqsBaseUrl().replace(/\/+$/, "");
    const key = encodeURIComponent(ipqsApiKey());
    const strictness = ipqsStrictness();
    const url = `${base}/${key}/${encodeURIComponent(ip)}?strictness=${strictness}&allow_public_access_points=true`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(ipqsTimeoutMs()) });
    if (!res.ok) return { source: IPQS_SOURCE, error: "provider_error" };
    const payload: unknown = await res.json();
    return parseIpqsResponse(payload);
  } catch {
    return { source: IPQS_SOURCE, error: "provider_error" };
  }
}
