// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { sanitizeAdminDateRange, parseOptionalUserId, getOfferwallAnalyticsReport } from "./offerwall.service.js";
export async function getOfferwallAnalytics(req, res) {
    try {
        const parsed = sanitizeAdminDateRange(req.query.from, req.query.to);
        if (!parsed.ok) {
            res.status(400).json({ ok: false, message: parsed.message });
            return;
        }
        const { from, to, serverNow } = parsed.range;
        const userId = parseOptionalUserId(req.query.userId);
        if (req.query.userId != null && req.query.userId !== "" && userId == null) {
            res.status(400).json({ ok: false, message: "Invalid userId" });
            return;
        }
        const report = await getOfferwallAnalyticsReport({ userId, from, to, serverNow });
        res.json({ ok: true, ...report });
    }
    catch (err) {
        res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
}
