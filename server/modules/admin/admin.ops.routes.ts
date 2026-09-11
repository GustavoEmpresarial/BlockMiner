// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Admin ops routes. Ported from
 * legacy/server/modules/admin-system/adminOps.admin.routes.ts.
 * Mounted at /ops inside adminRouter → inherits requireAdminAuth + adminLimiter.
 *
 * Deviations from legacy:
 *  - GET /audit is NOT duplicated here — current already exposes it at
 *    GET /api/admin/admin-audit (adminAuditLogHandler in admin.controller.ts).
 *  - GET /snapshot is now a REAL port (see admin.ops.snapshot.ts for the full
 *    breakdown of what's real vs. an honest stub — Redis/BullMQ/Socket.IO/
 *    in-process metrics registry do not exist in current/ yet, so those
 *    sections report `not_applicable`/`available: false` rather than being
 *    fabricated).
 */
import express from "express";
import { getServerMetrics } from "./admin.server-metrics.controller.js";
import { buildOpsSnapshot } from "./admin.ops.snapshot.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("AdminOpsRoutes");
export const adminOpsRouter = express.Router();
// Live CPU/RAM/disk from the Node process host — real numbers via os module.
adminOpsRouter.get("/server-metrics", (req, res) => getServerMetrics(req, res));
adminOpsRouter.get("/snapshot", async (_req, res) => {
    try {
        const snapshot = await buildOpsSnapshot();
        res.json({ ok: true, snapshot });
    }
    catch (error) {
        log.error("buildOpsSnapshot failed", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Unable to build ops snapshot." });
    }
});
