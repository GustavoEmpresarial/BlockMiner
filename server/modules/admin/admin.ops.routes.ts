/**
 * Admin ops routes.
 * Mounted at /ops inside adminRouter → inherits requireAdminAuth + adminLimiter.
 */
import express, { type Request, type Response } from "express";
import { getServerMetrics } from "./admin.server-metrics.controller.js";
import { buildOpsSnapshot } from "./admin.ops.snapshot.js";
import { requireAdminPermission } from "./admin.permissions.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("AdminOpsRoutes");
export const adminOpsRouter = express.Router();

adminOpsRouter.use(requireAdminPermission("monitoring", "dashboard"));

// Live CPU/RAM/disk from the Node process host — real numbers via os module.
adminOpsRouter.get("/server-metrics", getServerMetrics);

adminOpsRouter.get("/snapshot", async (_req: Request, res: Response) => {
    try {
        const snapshot = await buildOpsSnapshot();
        res.json({ ok: true, snapshot });
    }
    catch (error) {
        log.error("buildOpsSnapshot failed", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, code: "OPS_SNAPSHOT_ERROR", message: "Unable to build ops snapshot." });
    }
});
