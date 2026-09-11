/**
 * Verdict for anonymous networks (VPN / proxy / Tor / relay / Cloudflare WARP).
 * Pure — no I/O. Callers decide whether to reject (AUTH_BLOCK_VPN_PROXY).
 */
import { CLOUDFLARE_WARP_ASN, PROXY_TYPE_PRIORITY } from "./ip-intelligence.config.js";
import type { IpIntelligenceResult } from "./ip-intelligence.types.js";

export const ANONYMOUS_PROVIDER_TYPES = new Set(["vpn_proxy", "tor"]);
/** Require explicit WARP (not bare "Cloudflare" CDN/org strings — those FPs residential/API paths). */
export const WARP_ORG_PATTERN = /\bcloudflare\s+warp\b|\bwarp\b/i;

export type AnonymousIpInput = Pick<
  IpIntelligenceResult,
  "proxyDetected" | "proxyType" | "providerType" | "asn" | "asnOrg" | "proxyProvider" | "reverseDns" | "providerLabel"
>;

export type AnonymousIpVerdict = {
  blocked: boolean;
  reason: string | null;
};

function haystack(input: AnonymousIpInput): string {
  return [input.asnOrg, input.proxyProvider, input.reverseDns, input.providerLabel, input.proxyType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isAnonymousProxyType(type: string | null | undefined): boolean {
  const normalized = String(type || "").trim().toLowerCase();
  if (!normalized) return false;
  if ((PROXY_TYPE_PRIORITY as readonly string[]).includes(normalized)) return true;
  return normalized === "warp";
}

export function evaluateAnonymousIp(input: AnonymousIpInput | null | undefined): AnonymousIpVerdict {
  if (!input) return { blocked: false, reason: null };
  if (input.proxyDetected === true) {
    return { blocked: true, reason: input.proxyType ? `provider:${input.proxyType}` : "provider:proxy" };
  }
  if (isAnonymousProxyType(input.proxyType)) {
    return { blocked: true, reason: `type:${String(input.proxyType).toLowerCase()}` };
  }
  if (ANONYMOUS_PROVIDER_TYPES.has(String(input.providerType || ""))) {
    return { blocked: true, reason: `providerType:${input.providerType}` };
  }
  if (Number(input.asn) === CLOUDFLARE_WARP_ASN) {
    return { blocked: true, reason: `asn:${CLOUDFLARE_WARP_ASN}` };
  }
  if (WARP_ORG_PATTERN.test(haystack(input))) {
    return { blocked: true, reason: "org:cloudflare_warp" };
  }
  return { blocked: false, reason: null };
}
