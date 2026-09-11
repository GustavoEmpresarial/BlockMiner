// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { getPublicLiveStats } from "./public-stats.service.js";
import { PUBLIC_STATS_ERROR } from "./public-stats.errors.js";
import { reportError } from "../../core/errors/index.js";
export async function getLiveStats(req, res) {
    try {
        const stats = await getPublicLiveStats();
        res.json({ ok: true, stats });
    }
    catch (err) {
        reportError({
            code: "PUBLIC_LIVE_STATS_FAILED",
            category: "BUSINESS",
            severity: "WARNING",
            module: "public-stats.landing",
            error: err,
            req,
        });
        res.status(500).json({ ok: false, code: PUBLIC_STATS_ERROR.LIVE_STATS_FAILED });
    }
}
