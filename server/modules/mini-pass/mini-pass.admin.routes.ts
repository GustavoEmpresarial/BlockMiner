/**
 * Admin routes for Mini Pass seasons, rewards, and missions.
 * Mounted under /api/admin — protected by requireAdminAuth, dedicated rate limiter, and granular RBAC.
 */
import { Router } from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as ctrl from "./mini-pass.admin.controller.js";

export const miniPassAdminRouter = Router();

const adminLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "admin_mini_pass",
  keyGenerator: (req) => `admin_ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.admin?.adminId ? `admin:${req.admin.adminId}` : null),
});

miniPassAdminRouter.use(requireAdminAuth);
miniPassAdminRouter.use(adminLimiter);

const viewGuard = requireAdminPermission("mini_pass.view", "mini_pass");
const manageGuard = requireAdminPermission("mini_pass");

miniPassAdminRouter.get("/mini-pass/seasons", viewGuard, ctrl.adminListMiniPassSeasons);
miniPassAdminRouter.post("/mini-pass/seasons", manageGuard, ctrl.adminCreateMiniPassSeason);
miniPassAdminRouter.get("/mini-pass/seasons/:id", viewGuard, ctrl.adminGetMiniPassSeason);
miniPassAdminRouter.put("/mini-pass/seasons/:id", manageGuard, ctrl.adminUpdateMiniPassSeason);
miniPassAdminRouter.patch("/mini-pass/seasons/:id", manageGuard, ctrl.adminUpdateMiniPassSeason);
miniPassAdminRouter.delete("/mini-pass/seasons/:id", manageGuard, ctrl.adminSoftDeleteMiniPassSeason);

miniPassAdminRouter.post("/mini-pass/seasons/:seasonId/level-rewards", manageGuard, ctrl.adminUpsertLevelReward);
miniPassAdminRouter.put("/mini-pass/seasons/:seasonId/level-rewards/:rewardId", manageGuard, ctrl.adminUpsertLevelReward);
miniPassAdminRouter.patch("/mini-pass/seasons/:seasonId/level-rewards/:rewardId", manageGuard, ctrl.adminUpsertLevelReward);
miniPassAdminRouter.delete("/mini-pass/seasons/:seasonId/level-rewards/:rewardId", manageGuard, ctrl.adminDeleteLevelReward);

miniPassAdminRouter.post("/mini-pass/seasons/:seasonId/missions", manageGuard, ctrl.adminUpsertMission);
miniPassAdminRouter.put("/mini-pass/seasons/:seasonId/missions/:missionId", manageGuard, ctrl.adminUpsertMission);
miniPassAdminRouter.patch("/mini-pass/seasons/:seasonId/missions/:missionId", manageGuard, ctrl.adminUpsertMission);
miniPassAdminRouter.delete("/mini-pass/seasons/:seasonId/missions/:missionId", manageGuard, ctrl.adminDeleteMission);
