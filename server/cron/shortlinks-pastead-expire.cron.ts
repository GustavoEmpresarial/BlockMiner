// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Expires stale pending ZerAds/PasteAd external shortlink sessions globally.
 * Must NOT run on GET /shortlink/status — that path is polled every few seconds per user.
 */
import { logger } from "../core/logger/index.js";
import { expireStalePasteadSessions } from "../modules/shortlinks/shortlinks-pastead.service.js";
const log = logger.child("ShortlinksPasteadExpireCron");
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
export function startShortlinksPasteadExpireCron() {
    const intervalMs = Number(process.env.SHORTLINK_PASTEAD_EXPIRE_CRON_MS || DEFAULT_INTERVAL_MS);
    const run = () => {
        expireStalePasteadSessions().catch((err) => {
            log.warn("Pastead expire sweep failed", { error: err instanceof Error ? err.message : String(err) });
        });
    };
    run();
    const handle = setInterval(run, intervalMs);
    handle.unref?.();
    log.info("Shortlinks pastead expire cron started", { intervalMs });
    return { stop: () => clearInterval(handle) };
}
