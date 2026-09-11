/**
 * Login/register/session gate for VPN, proxy, Tor, relay, and Cloudflare WARP.
 * Uses ip-intelligence cache + live providers. Degrades open if lookup fails.
 */
import type { Request } from "express";
import type { AppPrisma } from "../../../core/database/prisma.js";
import { invalidateAuthUserCache } from "../../../shared/security/authUser.js";
import { applyAnonymousSessionEviction } from "./login.anonymous-evict.js";
import {
  authBlockVpnProxy,
  evaluateAnonymousIp,
  getCachedIpIntelligence,
  getClientIpFromResolver,
} from "../../ip-intelligence/index.js";
import type { AnonymousIpVerdict } from "../../ip-intelligence/ip-intelligence.policy.js";

export type AnonymousIpInspection = AnonymousIpVerdict & {
  proxySource: string | null;
  asn: number | null;
  proxyDetected: boolean | null;
};

export function loginClientIp(req: Request): string {
  return getClientIpFromResolver(req) || String(req.ip || "");
}

export async function inspectAnonymousLoginIp(prisma: AppPrisma, ip: string): Promise<AnonymousIpInspection> {
  if (!authBlockVpnProxy()) {
    return { blocked: false, reason: null, proxySource: null, asn: null, proxyDetected: null };
  }
  const intel = await getCachedIpIntelligence(prisma, ip).catch(() => null);
  const verdict = evaluateAnonymousIp(intel);
  return {
    ...verdict,
    proxySource: intel?.proxySource ?? null,
    asn: intel?.asn ?? null,
    proxyDetected: intel?.proxyDetected ?? null,
  };
}

export { applyAnonymousSessionEviction } from "./login.anonymous-evict.js";

/** Inspect current IP; if anonymous, evict the session. */
export async function evictIfAnonymousNetwork(
  prisma: AppPrisma,
  userId: number,
  ip: string,
): Promise<AnonymousIpInspection> {
  const verdict = await inspectAnonymousLoginIp(prisma, ip);
  if (verdict.blocked) {
    await applyAnonymousSessionEviction(prisma, userId, invalidateAuthUserCache);
  }
  return verdict;
}
