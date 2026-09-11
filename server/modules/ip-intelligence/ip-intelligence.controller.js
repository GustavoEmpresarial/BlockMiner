import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { getCachedIpIntelligence } from "./ip-intelligence.service.js";
import { normalizeIp } from "./ip-address.js";
const log = logger.child("ip-intelligence.controller");
/**
 * GET /:ip — used by admin fraud-signals "refresh-ip". Always responds 200 with an honest
 * result — "unknown"/error fields when no external data source is configured, never a crash.
 */
export async function refreshIpIntelligence(req, res) {
    const ip = normalizeIp(req.params.ip);
    if (!ip) {
        res.status(400).json({ ok: false, code: "invalid_ip", message: "Invalid IP address." });
        return;
    }
    try {
        const forceRefresh = String(req.query.forceRefresh ?? "") === "1";
        const result = await getCachedIpIntelligence(prisma, ip, { forceRefresh });
        res.json({ ok: true, intelligence: result });
    }
    catch (err) {
        log.warn("refresh_ip_failed", { err: err instanceof Error ? err.message : String(err) });
        // Never a 500 for an intelligence-degraded result — respond honestly instead of crashing.
        res.json({ ok: true, intelligence: null, degraded: true });
    }
}
