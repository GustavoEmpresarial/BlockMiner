/**
 * GetIPIntel — http://check.getipintel.net/check.php
 * Free: contact email required, ≤500/day, ≤15/min. flags=m → 0|1 ban-list only.
 */
import {
  GETIPINTEL_SOURCE,
  getipintelBlockScore,
  getipintelContactEmail,
  getipintelEnabled,
  getipintelFlags,
  getipintelTimeoutMs,
} from "./ip-intelligence.config.js";
import { parseAsn, parseRiskScore } from "./ip-intelligence.parse.js";
import type { ProxyLookupDeps, ProxyLookupResult } from "./ip-intelligence.types.js";

export type GetipintelResponse = {
  status?: unknown;
  result?: unknown;
  message?: unknown;
  queryIP?: unknown;
  ASN?: unknown;
};

/** Pure parse — unit-testable without HTTP. */
export function parseGetipintelResponse(payload: unknown, blockScore: number): ProxyLookupResult {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { source: GETIPINTEL_SOURCE, error: "provider_error" };
  }
  const body = payload as GetipintelResponse;
  if (String(body.status || "").toLowerCase() !== "success") {
    return { source: GETIPINTEL_SOURCE, error: "provider_error" };
  }
  const score = Number(String(body.result ?? "").trim());
  if (!Number.isFinite(score) || score < 0) {
    return { source: GETIPINTEL_SOURCE, error: "provider_error" };
  }
  const proxyDetected = score >= blockScore;
  return {
    source: GETIPINTEL_SOURCE,
    proxyDetected,
    proxyType: proxyDetected ? "proxy" : null,
    proxyRiskScore: parseRiskScore(score * 100),
    proxyProvider: proxyDetected ? "getipintel" : null,
    proxyLastSeenAt: null,
    asn: parseAsn(body.ASN),
    asnOrg: null,
    error: null,
  };
}

export async function lookupGetipintel(
  ip: string,
  { fetchImpl = globalThis.fetch }: ProxyLookupDeps = {},
): Promise<ProxyLookupResult> {
  if (!getipintelEnabled() || typeof fetchImpl !== "function") {
    return { source: GETIPINTEL_SOURCE, error: "provider_not_configured" };
  }
  try {
    const contact = getipintelContactEmail();
    const flags = getipintelFlags();
    // Provider ToS: do not URL-encode query params (plain contact email).
    const url = `http://check.getipintel.net/check.php?ip=${ip}&contact=${contact}&format=json&flags=${flags}&oflags=a`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(getipintelTimeoutMs()) });
    if (!res.ok) return { source: GETIPINTEL_SOURCE, error: "provider_error" };
    const payload: unknown = await res.json();
    return parseGetipintelResponse(payload, getipintelBlockScore());
  } catch {
    return { source: GETIPINTEL_SOURCE, error: "provider_error" };
  }
}
