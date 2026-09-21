/**
 * Admin ops routes. Ported from
 * legacy/server/modules/admin-system/adminOps.admin.routes.ts.
 * Mounted at /ops inside adminRouter → inherits requireAdminAuth + adminLimiter.
 */
import express, { type Request, type Response } from "express";
import { getServerMetrics } from "./admin.server-metrics.controller.js";
import { buildOpsSnapshot } from "./admin.ops.snapshot.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("AdminOpsRoutes");
export const adminOpsRouter = express.Router();

// Live CPU/RAM/disk from the Node process host — real numbers via os module.
adminOpsRouter.get("/server-metrics", (req: Request, res: Response) => getServerMetrics(req, res));
adminOpsRouter.get("/snapshot", async (_req: Request, res: Response) => {
    try {
        const snapshot = await buildOpsSnapshot();
        res.json({ ok: true, snapshot });
    }
    catch (error) {
        log.error("buildOpsSnapshot failed", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Unable to build ops snapshot." });
    }
});
