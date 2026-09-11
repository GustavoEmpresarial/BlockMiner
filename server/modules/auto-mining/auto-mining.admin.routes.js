/**
 * Admin auto-mining rewards CRUD. Ported 1:1 from
 * legacy/server/modules/auto-mining/auto-mining.admin.routes.ts, using current's admin auth
 * (requireAdminAuth from modules/admin/index.ts) instead of legacy's [requireAuth, requireAdmin].
 */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as adminController from "./auto-mining.admin.controller.js";
export const autoMiningAdminRouter = express.Router();
autoMiningAdminRouter.use(requireAdminAuth);
autoMiningAdminRouter.post("/", adminController.createRewardHandler);
autoMiningAdminRouter.get("/", adminController.getAllRewardsHandler);
autoMiningAdminRouter.get("/active", adminController.getActiveRewardsHandler);
autoMiningAdminRouter.get("/stats", adminController.getRewardsStatsHandler);
/** Reject non-numeric ids so this catch-all cannot shadow /api/admin/<module>. */
function requireNumericRewardId(req, res, next) {
    if (!/^\d+$/.test(String(req.params.reward_id ?? ""))) {
        next("router");
        return;
    }
    next();
}
autoMiningAdminRouter.get("/:reward_id", requireNumericRewardId, adminController.getRewardHandler);
autoMiningAdminRouter.patch("/:reward_id", requireNumericRewardId, adminController.updateRewardHandler);
autoMiningAdminRouter.post("/:reward_id/activate", requireNumericRewardId, adminController.activateRewardHandler);
autoMiningAdminRouter.post("/:reward_id/deactivate", requireNumericRewardId, adminController.deactivateRewardHandler);
autoMiningAdminRouter.delete("/:reward_id", requireNumericRewardId, adminController.deleteRewardHandler);
