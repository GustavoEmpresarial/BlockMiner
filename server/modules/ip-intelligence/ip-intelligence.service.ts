/**
 * Cached reverse-DNS + hosting/proxy classification, with optional multi-provider
 * VPN/proxy lookups (ProxyCheck.io, VPNAPI.io, …).
 *
 * Each provider degrades honestly: no key / flag off → no network call.
 */
import dns from "dns/promises";
import net from "net";
import { deriveDefaultNetworkCidr, isInfrastructureIp, normalizeIp } from "./ip-address.js";
import {
  intelAsnTimeoutMs,
  intelDnsTimeoutMs,
  intelErrorTtlHours,
  intelReverseDnsEnabled,
  intelSuccessTtlDays,
  DEFAULT_PROVIDER_TTL_HOURS,
  PROXYCHECK_SOURCE,
  PROXY_SOURCE_MAX_LEN,
} from "./ip-intelligence.config.js";
import { joinProxySources, listEnabledProxyProviders, mergeProxyLookups, parseProxySources } from "./ip-intelligence.providers.js";
import { findCachedIp, upsertCachedIp, countProxyUsedTodayBySource } from "./ip-intelligence.repository.js";
import type { IntelLookupDeps, IpIntelligenceResult, ProxyLookupResult } from "./ip-intelligence.types.js";
import type { AppPrisma } from "../../core/database/prisma.js";

export { proxycheckEnabled } from "./ip-intelligence.config.js";
export { lookupProxycheck } from "./ip-intelligence.proxycheck.js";
export { vpnapiEnabled } from "./ip-intelligence.config.js";
export { lookupVpnapi } from "./ip-intelligence.vpnapi.js";
export { getipintelEnabled } from "./ip-intelligence.config.js";
export { lookupGetipintel } from "./ip-intelligence.getipintel.js";
export { iplogsEnabled } from "./ip-intelligence.config.js";
export { lookupIplogs } from "./ip-intelligence.iplogs.js";
export { ipapiisEnabled } from "./ip-intelligence.config.js";
export { lookupIpapiis } from "./ip-intelligence.ipapiis.js";
export { iphubEnabled } from "./ip-intelligence.config.js";
export { lookupIphub } from "./ip-intelligence.iphub.js";
export { ipqsEnabled } from "./ip-intelligence.config.js";
export { lookupIpqs } from "./ip-intelligence.ipqs.js";
export { vpnblockerEnabled } from "./ip-intelligence.config.js";
export { lookupVpnblocker } from "./ip-intelligence.vpnblocker.js";
export { abstractapiEnabled } from "./ip-intelligence.config.js";
export { lookupAbstractapi } from "./ip-intelligence.abstractapi.js";

const SUCCESS_TTL_DAYS = intelSuccessTtlDays();
const ERROR_TTL_HOURS = intelErrorTtlHours();
const DNS_TIMEOUT_MS = intelDnsTimeoutMs();

const HOSTING_TERMS = [
  "amazon", "aws", "google cloud", "google llc", "microsoft", "azure", "digitalocean", "hetzner",
  "ovh", "linode", "akamai", "vultr", "contabo", "hostinger", "hosting", "datacenter", "data center",
  "oracle cloud", "leaseweb", "choopa", "servers", "server",
];
const WARP_TERMS = ["cloudflare warp", "warp"];
const MOBILE_TERMS = ["mobile", "wireless", "celular", "cellular", "cgnat", "cg-nat", "tim", "claro", "vivo", "telefonica", "telefônica"];
const RESIDENTIAL_TERMS = ["telecom", "broadband", "fibra", "fiber", "residential", "residencial", "net virtua", "oi", "gvt"];
/** Keep tight — broad terms like "privacy"/"anonym" false-positive residential orgs. */
const VPN_TERMS = ["vpn", "proxy", "tor-exit", "tor exit", "m247"];
const EDU_TERMS = ["university", "universidade", "college", "school", "educacao", "educação"];

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function timeoutPromise<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}

function sliceString(value: unknown, max = 255): string | null {
  const s = String(value || "").trim();
  return s ? s.slice(0, max) : null;
}

function classifyFromText(text: string): { providerType: string; confidence: string; providerLabel: string | null } {
  const value = String(text || "").toLowerCase();
  if (!value) return { providerType: "unknown", confidence: "low", providerLabel: null };
  if (VPN_TERMS.some((term) => value.includes(term))) return { providerType: "vpn_proxy", confidence: "medium", providerLabel: "VPN/proxy" };
  if (WARP_TERMS.some((term) => value.includes(term))) return { providerType: "vpn_proxy", confidence: "high", providerLabel: "Cloudflare WARP" };
  if (HOSTING_TERMS.some((term) => value.includes(term))) return { providerType: "hosting", confidence: "medium", providerLabel: "Datacenter/hosting" };
  if (EDU_TERMS.some((term) => value.includes(term))) return { providerType: "education", confidence: "medium", providerLabel: "Education network" };
  if (MOBILE_TERMS.some((term) => value.includes(term))) return { providerType: "mobile", confidence: "medium", providerLabel: "Mobile/CGNAT carrier" };
  if (RESIDENTIAL_TERMS.some((term) => value.includes(term))) return { providerType: "residential", confidence: "medium", providerLabel: "Residential ISP" };
  return { providerType: "unknown", confidence: "low", providerLabel: null };
}

async function reverseDnsLookup(ip: string, resolver: typeof dns = dns): Promise<string | null> {
  try {
    const names = await timeoutPromise(resolver.reverse(ip), DNS_TIMEOUT_MS);
    return Array.isArray(names) && names.length ? String(names[0]).slice(0, 253) : null;
  } catch {
    return null;
  }
}

function infrastructureIntel(ip: string, checkedAt: Date): IpIntelligenceResult {
  const expiresAt = addMs(checkedAt, SUCCESS_TTL_DAYS * 24 * 60 * 60 * 1000);
  return {
    ip, ipVersion: net.isIP(ip), normalizedIp: ip, reverseDns: null, reverseDnsForwardConfirmed: null,
    asn: null, asnOrg: null, networkCidr: null, providerLabel: "infrastructure/proxy", providerType: "infrastructure",
    confidence: "high", source: "infrastructure", error: null, checkedAt, expiresAt,
    proxyDetected: null, proxyType: null, proxyRiskScore: null, proxyProvider: null,
    proxyLastSeenAt: null, proxyCheckedAt: null, proxyExpiresAt: null, proxySource: null, proxyError: null,
  };
}

/** ASN lookup: off by default (IP_ASN_PROVIDER=none) — local heuristic only, no external call. */
export async function lookupAsn(ip: string, { fetchImpl = globalThis.fetch }: IntelLookupDeps = {}) {
  const provider = String(process.env.IP_ASN_PROVIDER || "none").toLowerCase();
  if (provider !== "ipinfo") return { source: "local-heuristic" as const };
  const token = String(process.env.IPINFO_TOKEN || "").trim();
  if (!token || typeof fetchImpl !== "function") return { source: "ipinfo" as const, error: "provider_not_configured" };
  try {
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(intelAsnTimeoutMs()) });
    if (!res.ok) return { source: "ipinfo" as const, error: "provider_error" };
    const data = (await res.json()) as { org?: string; network?: string };
    const asnMatch = String(data.org || "").match(/^AS(\d+)\s+(.+)$/i);
    return {
      source: "ipinfo" as const,
      asn: asnMatch ? Number(asnMatch[1]) : null,
      asnOrg: asnMatch ? asnMatch[2].trim().slice(0, 255) : String(data.org || "").slice(0, 255) || null,
      networkCidr: typeof data.network === "string" ? data.network.slice(0, 64) : null,
    };
  } catch {
    return { source: "ipinfo" as const, error: "provider_error" };
  }
}

async function enrichIp(ipInput: string, deps: IntelLookupDeps = {}): Promise<IpIntelligenceResult> {
  const normalizedIp = normalizeIp(ipInput);
  const checkedAt = new Date();
  if (!normalizedIp) {
    return {
      ip: String(ipInput || ""), ipVersion: null, normalizedIp: null, reverseDns: null, reverseDnsForwardConfirmed: null,
      asn: null, asnOrg: null, networkCidr: null, providerLabel: null, providerType: "unknown", confidence: "low",
      source: "validation", error: "invalid_ip", checkedAt, expiresAt: addMs(checkedAt, ERROR_TTL_HOURS * 60 * 60 * 1000),
      proxyDetected: null, proxyType: null, proxyRiskScore: null, proxyProvider: null,
      proxyLastSeenAt: null, proxyCheckedAt: null, proxyExpiresAt: null, proxySource: null, proxyError: null,
    };
  }
  if (isInfrastructureIp(normalizedIp)) return infrastructureIntel(normalizedIp, checkedAt);
  const asnData = await lookupAsn(normalizedIp, deps);
  let reverseDns: string | null = null;
  let reverseDnsForwardConfirmed: boolean | null = null;
  if (intelReverseDnsEnabled()) {
    reverseDns = await reverseDnsLookup(normalizedIp, deps.resolver ?? dns);
    if (reverseDns) {
      try {
        const records = await timeoutPromise((deps.resolver ?? dns).lookup(reverseDns, { all: true }), DNS_TIMEOUT_MS);
        reverseDnsForwardConfirmed = records.some((r) => normalizeIp(r.address) === normalizedIp);
      } catch {
        reverseDnsForwardConfirmed = false;
      }
    }
  }
  const asnOrg = "asnOrg" in asnData ? asnData.asnOrg ?? null : null;
  const asn = "asn" in asnData ? asnData.asn ?? null : null;
  const rawCidr = "networkCidr" in asnData ? asnData.networkCidr : null;
  const networkCidr = typeof rawCidr === "string" && rawCidr.trim() !== "" ? rawCidr : deriveDefaultNetworkCidr(normalizedIp);
  const classification = classifyFromText([reverseDns, asnOrg].filter(Boolean).join(" "));
  const ttlMs = "error" in asnData && asnData.error ? ERROR_TTL_HOURS * 60 * 60 * 1000 : SUCCESS_TTL_DAYS * 24 * 60 * 60 * 1000;
  return {
    ip: normalizedIp, ipVersion: net.isIP(normalizedIp), normalizedIp, reverseDns, reverseDnsForwardConfirmed,
    asn, asnOrg, networkCidr, providerLabel: classification.providerLabel, providerType: classification.providerType,
    confidence: classification.confidence, source: asnData.source || "local-heuristic", error: ("error" in asnData ? asnData.error : null) || null,
    checkedAt, expiresAt: addMs(checkedAt, ttlMs),
    proxyDetected: null, proxyType: null, proxyRiskScore: null, proxyProvider: null,
    proxyLastSeenAt: null, proxyCheckedAt: null, proxyExpiresAt: null, proxySource: null, proxyError: null,
  };
}

function cacheRowToResult(row: {
  ip: string; ipVersion: number; reverseDns: string | null; reverseDnsForwardConfirmed: boolean | null;
  asn: number | null; asnOrg: string | null; networkCidr: string | null; providerLabel: string | null;
  providerType: string; confidence: string; source: string | null; error: string | null;
  proxyDetected: boolean | null; proxyType: string | null; proxyRiskScore: number | null;
  proxyProvider: string | null; proxyLastSeenAt: Date | null; proxyCheckedAt: Date | null;
  proxyExpiresAt: Date | null; proxySource: string | null; proxyError: string | null;
  checkedAt: Date; expiresAt: Date;
}): IpIntelligenceResult {
  return {
    ip: row.ip, ipVersion: row.ipVersion, normalizedIp: row.ip, reverseDns: row.reverseDns,
    reverseDnsForwardConfirmed: row.reverseDnsForwardConfirmed, asn: row.asn, asnOrg: row.asnOrg,
    networkCidr: row.networkCidr, providerLabel: row.providerLabel, providerType: row.providerType,
    confidence: row.confidence, source: row.source, error: row.error,
    proxyDetected: row.proxyDetected ?? null, proxyType: row.proxyType ?? null,
    proxyRiskScore: Number.isInteger(row.proxyRiskScore) ? row.proxyRiskScore : null,
    proxyProvider: row.proxyProvider ?? null, proxyLastSeenAt: row.proxyLastSeenAt ?? null,
    proxyCheckedAt: row.proxyCheckedAt ?? null, proxyExpiresAt: row.proxyExpiresAt ?? null,
    proxySource: row.proxySource ?? null, proxyError: row.proxyError ?? null,
    checkedAt: row.checkedAt, expiresAt: row.expiresAt,
  };
}

function emptyProxyFields(): Pick<
  IpIntelligenceResult,
  "proxyDetected" | "proxyType" | "proxyRiskScore" | "proxyProvider" | "proxyLastSeenAt" | "proxyCheckedAt" | "proxyExpiresAt" | "proxySource" | "proxyError"
> {
  return {
    proxyDetected: null, proxyType: null, proxyRiskScore: null, proxyProvider: null,
    proxyLastSeenAt: null, proxyCheckedAt: null, proxyExpiresAt: null, proxySource: null, proxyError: null,
  };
}

/**
 * Main entry: cached IP classification + optional multi-provider proxy check.
 * Never throws — DB/network problems degrade to an honest unknown/error result.
 */
export async function getCachedIpIntelligence(
  prisma: AppPrisma | null,
  ipInput: string,
  { forceRefresh = false, deps = {} }: { forceRefresh?: boolean; deps?: IntelLookupDeps } = {},
): Promise<IpIntelligenceResult | null> {
  const ip = normalizeIp(ipInput);
  if (!ip) return null;
  if (isInfrastructureIp(ip) && !forceRefresh) return infrastructureIntel(ip, new Date());
  const now = new Date();
  const row = prisma ? await findCachedIp(prisma, ip) : null;
  const coreFresh = Boolean(row?.expiresAt && row.expiresAt > now);
  const proxyFresh = Boolean(row?.proxyExpiresAt && row.proxyExpiresAt > now);
  const enabled = listEnabledProxyProviders();
  const cachedSources = parseProxySources(row?.proxySource);
  const missingProvider = enabled.some((p) => !cachedSources.includes(p.id));
  const needsCoreRefresh = forceRefresh || !row || !coreFresh;
  const needsProxyRefresh = enabled.length > 0 && (forceRefresh || !row || !proxyFresh || missingProvider);
  if (!needsCoreRefresh && !needsProxyRefresh && row) return cacheRowToResult(row);

  const base: IpIntelligenceResult = row
    ? cacheRowToResult(row)
    : {
        ip, ipVersion: net.isIP(ip), normalizedIp: ip, reverseDns: null, reverseDnsForwardConfirmed: null,
        asn: null, asnOrg: null, networkCidr: deriveDefaultNetworkCidr(ip), providerLabel: null,
        providerType: "unknown", confidence: "low", source: "cache", error: null, checkedAt: now, expiresAt: now,
        ...emptyProxyFields(),
      };

  const core = needsCoreRefresh ? await enrichIp(ip, deps) : base;

  let proxy: ProxyLookupResult & {
    proxyCheckedAt: Date | null;
    proxyExpiresAt: Date | null;
    proxySource: string | null;
    proxyError: string | null;
  } = {
    source: base.proxySource || PROXYCHECK_SOURCE,
    proxyDetected: base.proxyDetected ?? undefined,
    proxyType: base.proxyType,
    proxyRiskScore: base.proxyRiskScore,
    proxyProvider: base.proxyProvider,
    proxyLastSeenAt: base.proxyLastSeenAt,
    proxyCheckedAt: base.proxyCheckedAt,
    proxyExpiresAt: base.proxyExpiresAt,
    proxySource: base.proxySource,
    proxyError: base.proxyError,
  };

  if (needsProxyRefresh) {
    const since = startOfUtcDay(now);
    const toRun = enabled.filter((p) => forceRefresh || !proxyFresh || !cachedSources.includes(p.id));
    const budgeted: typeof toRun = [];
    let minTtlHours = DEFAULT_PROVIDER_TTL_HOURS;
    for (const provider of toRun) {
      const used = prisma ? await countProxyUsedTodayBySource(prisma, provider.id, since) : 0;
      if (used >= provider.dailyLimit()) continue;
      budgeted.push(provider);
      minTtlHours = Math.min(minTtlHours, provider.ttlHours());
    }
    const lookups: ProxyLookupResult[] = budgeted.length
      ? await Promise.all(budgeted.map((provider) => provider.lookup(ip, deps)))
      : [];
    if (lookups.length) {
      const prior: ProxyLookupResult[] = [];
      if (base.proxySource && !forceRefresh && proxyFresh) {
        prior.push({
          source: base.proxySource,
          proxyDetected: base.proxyDetected ?? undefined,
          proxyType: base.proxyType,
          proxyRiskScore: base.proxyRiskScore,
          proxyProvider: base.proxyProvider,
          proxyLastSeenAt: base.proxyLastSeenAt,
          error: null,
        });
      }
      const merged = mergeProxyLookups([...prior, ...lookups]);
      const sources = [
        ...parseProxySources(merged.source),
        ...(!forceRefresh && proxyFresh ? cachedSources : []),
      ];
      proxy = {
        ...merged,
        proxyCheckedAt: now,
        proxyExpiresAt: addMs(now, minTtlHours * 60 * 60 * 1000),
        proxySource: joinProxySources(sources) || merged.source,
        proxyError: merged.error ?? null,
      };
    }
  }

  const proxyAsn = Number.isInteger(proxy.asn) ? proxy.asn ?? null : null;
  const proxyAsnOrg = sliceString(proxy.asnOrg, 255);
  const asn = Number.isInteger(core.asn) ? core.asn : proxyAsn;
  const asnOrg = sliceString(core.asnOrg, 255) || proxyAsnOrg;
  let providerType = sliceString(core.providerType, 64) || "unknown";
  let providerLabel = sliceString(core.providerLabel, 255);
  let confidence = sliceString(core.confidence, 32) || "low";
  if (asnOrg) {
    const fromOrg = classifyFromText([core.reverseDns, asnOrg].filter(Boolean).join(" "));
    if (fromOrg.providerType === "vpn_proxy" || providerType === "unknown") {
      providerType = fromOrg.providerType;
      providerLabel = fromOrg.providerLabel;
      confidence = fromOrg.confidence;
    }
  }

  const data = {
    ip,
    ipVersion: core.ipVersion || net.isIP(ip) || 0,
    reverseDns: core.reverseDns ?? null,
    reverseDnsForwardConfirmed: core.reverseDnsForwardConfirmed ?? null,
    asn,
    asnOrg,
    networkCidr: sliceString(core.networkCidr, 64) || deriveDefaultNetworkCidr(ip),
    providerLabel,
    providerType,
    confidence,
    source: sliceString(core.source, 64) || "unknown",
    error: sliceString(core.error, 64),
    proxyDetected: typeof proxy.proxyDetected === "boolean" ? proxy.proxyDetected : null,
    proxyType: sliceString(proxy.proxyType, 64),
    proxyRiskScore: Number.isInteger(proxy.proxyRiskScore) ? proxy.proxyRiskScore : null,
    proxyProvider: sliceString(proxy.proxyProvider, 255),
    proxyLastSeenAt: proxy.proxyLastSeenAt instanceof Date ? proxy.proxyLastSeenAt : null,
    proxyCheckedAt: proxy.proxyCheckedAt instanceof Date ? proxy.proxyCheckedAt : null,
    proxyExpiresAt: proxy.proxyExpiresAt instanceof Date ? proxy.proxyExpiresAt : null,
    proxySource: sliceString(proxy.proxySource, PROXY_SOURCE_MAX_LEN),
    proxyError: sliceString(proxy.proxyError, 64),
    checkedAt: needsCoreRefresh ? now : (base.checkedAt ?? now),
    expiresAt: needsCoreRefresh ? core.expiresAt : (base.expiresAt ?? now),
  };

  if (prisma) {
    await upsertCachedIp(prisma, ip, data).catch(() => undefined);
  }
  return {
    ...core,
    ...proxy,
    source: core.source,
    asn: data.asn,
    asnOrg: data.asnOrg,
    providerType: data.providerType,
    providerLabel: data.providerLabel,
    confidence: data.confidence,
    proxySource: data.proxySource,
    proxyDetected: data.proxyDetected,
    proxyType: data.proxyType,
    proxyRiskScore: data.proxyRiskScore,
    proxyProvider: data.proxyProvider,
    proxyLastSeenAt: data.proxyLastSeenAt,
    proxyCheckedAt: data.proxyCheckedAt,
    proxyExpiresAt: data.proxyExpiresAt,
    proxyError: data.proxyError,
    ip,
    normalizedIp: ip,
    checkedAt: data.checkedAt,
    expiresAt: data.expiresAt,
  };
}
