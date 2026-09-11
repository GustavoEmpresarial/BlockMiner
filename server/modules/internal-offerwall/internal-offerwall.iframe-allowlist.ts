// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/internal-offerwall/internal-offerwall.iframe-allowlist.ts.
 * Real security control (CSP frame-src / SSRF-adjacent host allowlist) — ported faithfully,
 * not weakened. Only the prisma import path changed to current/'s singleton.
 */
import { Prisma } from "@prisma/client";
import { OFFER_KIND_GENERAL_TASK, OFFER_KIND_PTC_IFRAME } from "./internal-offerwall.config.js";
export const BUILTIN_IFRAME_HOSTS = ["zerads.com", "youtube.com", "youtube-nocookie.com", "blockminer.space"];
let cachedAllowlist = new Set(BUILTIN_IFRAME_HOSTS.map((h) => h.toLowerCase()));
export function getIframeHostAllowlistCachedSync() {
    return cachedAllowlist;
}
export function validateFrameHostnameForStorage(host) {
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
export async function upsertActiveFrameHost(prisma, host) {
    const vr = validateFrameHostnameForStorage(host);
    if (!vr.ok)
        return { ok: false, message: vr.message };
    await prisma.internalOfferwallFrameHost.upsert({
        where: { hostname: vr.hostname },
        create: { hostname: vr.hostname, isActive: true },
        update: { isActive: true },
    });
    return { ok: true };
}
export async function refreshIframeHostAllowlistCache(prisma) {
    const set = new Set(BUILTIN_IFRAME_HOSTS.map((h) => h.toLowerCase()));
    const rows = await prisma.internalOfferwallFrameHost.findMany({
        where: { isActive: true },
        select: { hostname: true },
    });
    for (const r of rows) {
        const h = String(r.hostname || "").trim().toLowerCase();
        if (h)
            set.add(h);
    }
    const ptcOffers = await prisma.internalOfferwallOffer.findMany({
        where: { kind: OFFER_KIND_PTC_IFRAME, iframeUrl: { not: null } },
        select: { iframeUrl: true },
    });
    for (const o of ptcOffers) {
        try {
            const u = new URL(String(o.iframeUrl));
            const h = u.hostname.toLowerCase();
            if (h && h !== "localhost")
                set.add(h);
        }
        catch {
            /* ignore bad stored URL */
        }
    }
    const genOffers = await prisma.internalOfferwallOffer.findMany({
        where: { kind: OFFER_KIND_GENERAL_TASK, taskMetadata: { not: Prisma.JsonNull } },
        select: { taskMetadata: true },
    });
    for (const o of genOffers) {
        const meta = o.taskMetadata && typeof o.taskMetadata === "object" ? o.taskMetadata : null;
        const ext = meta && meta.externalInfoUrl;
        if (ext == null || !String(ext).trim())
            continue;
        try {
            const u = new URL(String(ext));
            const h = u.hostname.toLowerCase();
            if (h && h !== "localhost")
                set.add(h);
        }
        catch {
            /* ignore */
        }
    }
    const partnerGames = await prisma.partnerGame
        .findMany({
        where: { isVisible: true },
        select: { iframeUrl: true, fallbackUrl: true, partnerUrl: true, coverImageUrl: true },
    })
        .catch(() => []);
    for (const g of partnerGames) {
        for (const raw of [g.iframeUrl, g.fallbackUrl, g.partnerUrl, g.coverImageUrl]) {
            if (!raw)
                continue;
            try {
                const u = new URL(String(raw));
                const h = u.hostname.toLowerCase();
                if (h && h !== "localhost")
                    set.add(h);
            }
            catch {
                /* ignore bad URL — admin validation should have caught it */
            }
        }
    }
    cachedAllowlist = set;
}
/** @internal test helper */
export function __setIframeHostAllowlistCacheForTests(hosts) {
    cachedAllowlist = new Set(hosts.map((h) => h.toLowerCase()));
}
