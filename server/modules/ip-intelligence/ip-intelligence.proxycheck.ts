/**
 * ProxyCheck.io v2 client. No network call when unconfigured.
 */
import { PROXYCHECK_SOURCE, proxycheckApiKey, proxycheckEnabled, proxycheckTimeoutMs } from "./ip-intelligence.config.js";
import type { ProxyLookupDeps, ProxyLookupResult } from "./ip-intelligence.types.js";

function sliceString(value: unknown, max = 255): string | null {
  const s = String(value || "").trim();
  return s ? s.slice(0, max) : null;
}

function parseYesNo(value: unknown): boolean | undefined {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") return true;
  if (normalized === "no" || normalized === "false") return false;
  return undefined;
}

function parseRiskScore(value: unknown): number | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseAsn(value: unknown): number | null {
  const match = String(value ?? "").trim().match(/AS?(\d+)/i);
  if (!match) {
    const n = Number(String(value ?? "").trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseUnixSeconds(value: unknown): Date | null {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const date = new Date(n * 1000);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function lookupProxycheck(ip: string, { fetchImpl = globalThis.fetch }: ProxyLookupDeps = {}): Promise<ProxyLookupResult> {
  if (!proxycheckEnabled() || typeof fetchImpl !== "function") {
    return { source: PROXYCHECK_SOURCE, error: "provider_not_configured" };
  }
  try {
    const key = encodeURIComponent(proxycheckApiKey());
    const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${key}&vpn=1&asn=1&risk=1&seen=1`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(proxycheckTimeoutMs()) });
    if (!res.ok) return { source: PROXYCHECK_SOURCE, error: "provider_error" };
    const payload = (await res.json()) as Record<string, unknown>;
    if (String(payload?.status || "").toLowerCase() !== "ok") {
      return { source: PROXYCHECK_SOURCE, error: "provider_error" };
    }
    const record = payload[ip] && typeof payload[ip] === "object" ? (payload[ip] as Record<string, unknown>) : null;
    if (!record) return { source: PROXYCHECK_SOURCE, error: "provider_error" };
    return {
      source: PROXYCHECK_SOURCE,
      proxyDetected: parseYesNo(record.proxy),
      proxyType: sliceString(record.type, 64),
      proxyRiskScore: parseRiskScore(record.risk),
      proxyProvider: sliceString(record.provider, 255),
      proxyLastSeenAt: parseUnixSeconds(record["last seen unix"]),
      asn: parseAsn(record.asn),
      asnOrg: sliceString(record.organisation || record.organization || record.provider, 255),
      error: null,
    };
  } catch {
    return { source: PROXYCHECK_SOURCE, error: "provider_error" };
  }
}
