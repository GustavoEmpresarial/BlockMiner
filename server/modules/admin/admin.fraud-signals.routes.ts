// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Admin fraud-signals routes — PARTIAL port of
 * legacy/server/modules/admin-system/fraudSignals.admin.routes.ts.
 * Mounted at /fraud-signals inside adminRouter → inherits requireAdminAuth +
 * adminLimiter. Full paths /api/admin/fraud-signals* unchanged.
 *
 * GET / — simplified cluster listing, see admin.fraud-signals.service.ts.
 * POST /refresh-ip — now backed by the ip-intelligence module (see index.ts import below).
 *   Degrades gracefully to an honest "unknown"/error result when no ProxyCheck.io API key is
 *   configured — this is expected behavior in this environment, not a bug.
 * POST /reset-collection — full port (confirmation phrase + destructive
 *   transaction + audit log), same as legacy.
 */
import express from "express";
import prisma from "../../core/database/prisma.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { logAdminAction } from "./admin.audit-log.service.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import { logger } from "../../core/logger/index.js";
import { getCachedIpIntelligence, normalizeIp } from "../ip-intelligence/index.js";
import { listAdminFraudSignals, resetAdminFraudCollectionData, getFraudCollectionResetConfirmPhrase, InvalidFraudQueryError, } from "./admin.fraud-signals.service.js";
export const fraudSignalsAdminRouter = express.Router();
const log = logger.child("AdminFraudSignals");
function errMsg(error) {
    return error instanceof Error ? error.message : String(error);
}
fraudSignalsAdminRouter.get("/", async (req, res) => {
    try {
        const data = await listAdminFraudSignals(prisma, {
            scope: req.query.scope,
            page: req.query.page,
            limit: req.query.limit,
        });
        res.json({ ok: true, ...data });
    }
    catch (error) {
        if (error instanceof InvalidFraudQueryError) {
            res.status(400).json({ ok: false, message: "Invalid fraud signal query." });
            return;
        }
        log.error("[admin fraud-signals]", { error: errMsg(error) });
        res.status(500).json({ ok: false, message: "Error" });
    }
});
fraudSignalsAdminRouter.post("/refresh-ip", async (req, res) => {
    const ip = normalizeIp(req.body?.ip ?? req.query.ip);
    if (!ip) {
        res.status(400).json({ ok: false, message: "Invalid or missing IP address." });
        return;
    }
    try {
        const forceRefresh = req.body?.forceRefresh === true || String(req.query.forceRefresh ?? "") === "1";
        const intelligence = await getCachedIpIntelligence(prisma, ip, { forceRefresh });
        // Honest degradation: no real PROXYCHECK_API_KEY is configured in this environment, so
        // proxyDetected/proxyType/etc. stay null ("unknown") rather than being fabricated.
        res.json({ ok: true, ip, intelligence });
    }
    catch (error) {
        log.error("[admin fraud-signals refresh-ip]", { error: errMsg(error) });
        res.status(500).json({ ok: false, message: "Unable to refresh IP intelligence." });
    }
});
const fraudResetLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: "Too many fraud data reset requests. Try again later.",
});
fraudSignalsAdminRouter.post("/reset-collection", fraudResetLimiter, async (req, res) => {
    try {
        const confirm = String(req.body?.confirm ?? "").trim();
        if (confirm !== getFraudCollectionResetConfirmPhrase()) {
            res.status(400).json({ ok: false, message: "Confirmation phrase mismatch." });
            return;
        }
        const { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared } = await resetAdminFraudCollectionData(prisma);
        await logAdminAction({
            adminId: req.admin?.adminId ?? null,
            action: "ADMIN_FRAUD_RESET_COLLECTION",
            module: "admin",
            resource: "FraudCollection",
            newValue: { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared },
            ipAddress: getClientIp(req),
            userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
        });
        res.json({
            ok: true,
            message: "Fraud collection data cleared.",
            ipLogsDeleted,
            ipIntelDeleted,
            usersProfileAntiFraudCleared,
        });
    }
    catch (error) {
        log.error("[admin fraud-signals reset-collection]", { error: errMsg(error) });
        res.status(500).json({ ok: false, message: "Unable to reset fraud collection data." });
    }
});
