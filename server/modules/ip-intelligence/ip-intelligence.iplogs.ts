/**
 * IPLogs — POST https://iplogs.com/v1/check
 * Free VPN/proxy/Tor detection, no API key (fair-use rate limits).
 */
import { IPLOGS_SOURCE, iplogsBaseUrl, iplogsEnabled, iplogsTimeoutMs } from "./ip-intelligence.config.js";
import { asBool, parseAsn, parseRiskScore, sliceString, typeFromFlags } from "./ip-intelligence.parse.js";
import type { ProxyLookupDeps, ProxyLookupResult } from "./ip-intelligence.types.js";

export type IplogsResponse = {
  score?: unknown;
  verdict?: unknown;
  is_vpn?: unknown;
  ip_info?: {
    asn?: unknown;
    org?: unknown;
    is_vpn?: unknown;
    is_proxy?: unknown;
    vpn_provider?: unknown;
  };
};

/** Pure parse of IPLogs JSON. */
export function parseIplogsResponse(payload: unknown): ProxyLookupResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { source: IPLOGS_SOURCE, error: "provider_error" };
  }
  const body = payload as IplogsResponse;
  const info = body.ip_info && typeof body.ip_info === "object" ? body.ip_info : {};
  const vpn = asBool(body.is_vpn) || asBool(info.is_vpn);
  const proxy = asBool(info.is_proxy);
  const verdict = String(body.verdict || "").toLowerCase();
  const tor = verdict.includes("tor");
  const verdictHit = /vpn|proxy|tor/.test(verdict) && verdict !== "clean";
  const proxyDetected = vpn || proxy || tor || verdictHit;
  const proxyType = typeFromFlags({ tor, vpn: vpn && !tor, proxy: proxy && !vpn && !tor });
  const org = sliceString(info.vpn_provider || info.org, 255);
  const scoreRaw = Number(body.score);
  return {
    source: IPLOGS_SOURCE,
    proxyDetected,
    proxyType: proxyDetected ? proxyType || "proxy" : null,
    proxyRiskScore: Number.isFinite(scoreRaw) ? parseRiskScore(scoreRaw * 100) : null,
    proxyProvider: org,
    proxyLastSeenAt: null,
    asn: parseAsn(info.asn),
    asnOrg: sliceString(info.org, 255),
    error: null,
  };
}

export async function lookupIplogs(ip: string, { fetchImpl = globalThis.fetch }: ProxyLookupDeps = {}): Promise<ProxyLookupResult> {
  if (!iplogsEnabled() || typeof fetchImpl !== "function") {
    return { source: IPLOGS_SOURCE, error: "provider_not_configured" };
  }
  try {
    const base = iplogsBaseUrl().replace(/\/+$/, "");
    const res = await fetchImpl(`${base}/v1/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ip }),
      signal: AbortSignal.timeout(iplogsTimeoutMs()),
    });
    if (!res.ok) return { source: IPLOGS_SOURCE, error: "provider_error" };
    const payload: unknown = await res.json();
    return parseIplogsResponse(payload);
  } catch {
    return { source: IPLOGS_SOURCE, error: "provider_error" };
  }
}
