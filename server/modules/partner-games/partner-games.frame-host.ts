// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import { refreshIframeHostAllowlistCache, upsertActiveFrameHost } from "../internal-offerwall/internal-offerwall.iframe-allowlist.js";
const log = logger.child("PartnerGamesFrameHost");
export function hostnameFromUrl(raw) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed)
        return null;
    try {
        const host = new URL(trimmed).hostname.toLowerCase();
        return host && host !== "localhost" ? host : null;
    }
    catch {
        return null;
    }
}
export async function registerPartnerGameFrameHosts(prismaClient, urls) {
    const hosts = new Set();
    for (const raw of urls) {
        const host = hostnameFromUrl(raw);
        if (host)
            hosts.add(host);
    }
    for (const host of hosts) {
        const result = await upsertActiveFrameHost(prismaClient, host);
        if (!result.ok) {
            log.warn("partnerGames.frame_host_skip", { host, message: result.message });
        }
    }
}
export function refreshFrameAllowlistBestEffort(prismaClient) {
    refreshIframeHostAllowlistCache(prismaClient).catch((err) => log.warn("partnerGames.refresh_iframe_allowlist_failed", { err: String(err) }));
}
