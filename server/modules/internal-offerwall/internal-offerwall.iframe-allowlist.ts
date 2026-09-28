/**
 * Ported from legacy/server/modules/internal-offerwall/internal-offerwall.iframe-allowlist.ts.
 * Real security control (CSP frame-src / SSRF-adjacent host allowlist) — ported faithfully,
 * not weakened. Only the prisma import path changed to current/'s singleton.
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { TxClient } from "../../core/database/prisma.js";
import { OFFER_KIND_GENERAL_TASK, OFFER_KIND_PTC_IFRAME } from "./internal-offerwall.config.js";
import type { ValidateFrameHostnameResult } from "./internal-offerwall.types.js";

type PrismaOrTx = PrismaClient | TxClient;

export const BUILTIN_IFRAME_HOSTS = ["zerads.com", "youtube.com", "youtube-nocookie.com", "blockminer.space"];
let cachedAllowlist = new Set<string>(BUILTIN_IFRAME_HOSTS.map((h) => h.toLowerCase()));

export function getIframeHostAllowlistCachedSync(): Set<string> {
  return cachedAllowlist;
}

export function validateFrameHostnameForStorage(host: unknown): ValidateFrameHostnameResult {
  const h = String(host || "").trim().toLowerCase();
  if (!h || h === "localhost") {
    return { ok: false, message: "Invalid iframe hostname." };
  }
  if (h.length > 253 || h.includes(":") || h.includes("[") || h.includes("]")) {
    return { ok: false, message: "Invalid iframe hostname." };
  }
  if (!/^[a-z0-9.-]+$/.test(h) || h.startsWith(".") || h.endsWith(".") || h.includes("..")) {
    return { ok: false, message: "Invalid iframe hostname." };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    return { ok: false, message: "IP addresses are not allowed as iframe hosts." };
  }
  return { ok: true, hostname: h };
}

export async function upsertActiveFrameHost(
  prismaClient: PrismaOrTx,
  host: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const vr = validateFrameHostnameForStorage(host);
  if (!vr.ok) return { ok: false, message: vr.message };
  await (prismaClient as PrismaClient).internalOfferwallFrameHost.upsert({
    where: { hostname: vr.hostname },
    create: { hostname: vr.hostname, isActive: true },
    update: { isActive: true },
  });
  return { ok: true };
}

export async function refreshIframeHostAllowlistCache(prismaClient: PrismaOrTx): Promise<Set<string>> {
  const set = new Set<string>(BUILTIN_IFRAME_HOSTS.map((h) => h.toLowerCase()));
  const rows = await (prismaClient as PrismaClient).internalOfferwallFrameHost.findMany({
    where: { isActive: true },
    select: { hostname: true },
  });
  for (const r of rows) {
    const h = String(r.hostname || "").trim().toLowerCase();
    if (h) set.add(h);
  }
  const ptcOffers = await (prismaClient as PrismaClient).internalOfferwallOffer.findMany({
    where: { kind: OFFER_KIND_PTC_IFRAME, iframeUrl: { not: null } },
    select: { iframeUrl: true },
  });
  for (const o of ptcOffers) {
    try {
      const u = new URL(String(o.iframeUrl));
      const h = u.hostname.toLowerCase();
      if (h && h !== "localhost") set.add(h);
    } catch {
      /* ignore bad stored URL */
    }
  }
  const genOffers = await (prismaClient as PrismaClient).internalOfferwallOffer.findMany({
    where: { kind: OFFER_KIND_GENERAL_TASK, taskMetadata: { not: Prisma.JsonNull } },
    select: { taskMetadata: true },
  });
  for (const o of genOffers) {
    const meta = o.taskMetadata && typeof o.taskMetadata === "object" ? (o.taskMetadata as Record<string, unknown>) : null;
    const ext = meta && meta.externalInfoUrl;
    if (ext == null || !String(ext).trim()) continue;
    try {
      const u = new URL(String(ext));
      const h = u.hostname.toLowerCase();
      if (h && h !== "localhost") set.add(h);
    } catch {
      /* ignore */
    }
  }
  const partnerGames = await (prismaClient as PrismaClient).partnerGame
    .findMany({
      where: { isVisible: true },
      select: { iframeUrl: true, fallbackUrl: true, partnerUrl: true, coverImageUrl: true },
    })
    .catch(() => []);
  for (const g of partnerGames) {
    for (const raw of [g.iframeUrl, g.fallbackUrl, g.partnerUrl, g.coverImageUrl]) {
      if (!raw) continue;
      try {
        const u = new URL(String(raw));
        const h = u.hostname.toLowerCase();
        if (h && h !== "localhost") set.add(h);
      } catch {
        /* ignore bad URL — admin validation should have caught it */
      }
    }
  }
  cachedAllowlist = set;
  return set;
}

/** @internal test helper */
export function __setIframeHostAllowlistCacheForTests(hosts: string[]): void {
  cachedAllowlist = new Set(hosts.map((h) => h.toLowerCase()));
}
