// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import { getPublicLiveStats } from "./public-stats.service.js";
import { PUBLIC_STATS_ERROR } from "./public-stats.errors.js";
const log = logger.child("public-live-stats.controller");
export async function getLiveStats(_req, res) {
    try {
        const stats = await getPublicLiveStats();
        res.json({ ok: true, stats });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("live_stats_failed", { err: msg });
        res.status(500).json({ ok: false, code: PUBLIC_STATS_ERROR.LIVE_STATS_FAILED });
    }
}
