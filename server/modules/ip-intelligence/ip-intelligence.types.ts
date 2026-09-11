/** Ported from legacy/server/modules/ip-intelligence/ipAddress.ts + ipIntelligenceService.ts. */

export type ClientIpSource = string;

export type ResolvedClientIp = {
  ip: string;
  source: string;
  remoteAddress: string | null;
  infrastructure: boolean;
  headersTrusted: boolean;
};

export type IpIntelligenceRequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
  ip?: string;
};

export type IpIntelligenceResult = {
  ip: string;
  ipVersion: number | null;
  normalizedIp: string | null;
  reverseDns: string | null;
  reverseDnsForwardConfirmed: boolean | null;
  asn: number | null;
  asnOrg: string | null;
  networkCidr: string | null;
  providerLabel: string | null;
  providerType: string;
  confidence: string;
  source: string | null;
  error: string | null;
  proxyDetected: boolean | null;
  proxyType: string | null;
  proxyRiskScore: number | null;
  proxyProvider: string | null;
  proxyLastSeenAt: Date | null;
  proxyCheckedAt: Date | null;
  proxyExpiresAt: Date | null;
  proxySource: string | null;
  proxyError: string | null;
  checkedAt: Date;
  expiresAt: Date;
};

export type ProxyLookupResult = {
  source: string;
  proxyDetected?: boolean;
  proxyType?: string | null;
  proxyRiskScore?: number | null;
  proxyProvider?: string | null;
  proxyLastSeenAt?: Date | null;
  asn?: number | null;
  asnOrg?: string | null;
  error?: string | null;
};

export type ProxyLookupDeps = {
  fetchImpl?: typeof fetch;
};

export type IntelLookupDeps = ProxyLookupDeps & {
  resolver?: typeof import("dns/promises");
};
