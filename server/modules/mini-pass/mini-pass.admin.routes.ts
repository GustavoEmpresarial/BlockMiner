// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import * as ctrl from "./mini-pass.admin.controller.js";
/** Mount under `/api/admin` — paths include `/mini-pass/...` (legacy layout). */
export const miniPassAdminRouter = Router();
miniPassAdminRouter.use(requireAdminAuth);
miniPassAdminRouter.get("/mini-pass/seasons", ctrl.adminListMiniPassSeasons);
miniPassAdminRouter.post("/mini-pass/seasons", ctrl.adminCreateMiniPassSeason);
miniPassAdminRouter.get("/mini-pass/seasons/:id", ctrl.adminGetMiniPassSeason);
miniPassAdminRouter.put("/mini-pass/seasons/:id", ctrl.adminUpdateMiniPassSeason);
miniPassAdminRouter.delete("/mini-pass/seasons/:id", ctrl.adminSoftDeleteMiniPassSeason);
miniPassAdminRouter.post("/mini-pass/seasons/:seasonId/level-rewards", ctrl.adminUpsertLevelReward);
miniPassAdminRouter.put("/mini-pass/seasons/:seasonId/level-rewards/:rewardId", ctrl.adminUpsertLevelReward);
miniPassAdminRouter.delete("/mini-pass/seasons/:seasonId/level-rewards/:rewardId", ctrl.adminDeleteLevelReward);
miniPassAdminRouter.post("/mini-pass/seasons/:seasonId/missions", ctrl.adminUpsertMission);
miniPassAdminRouter.put("/mini-pass/seasons/:seasonId/missions/:missionId", ctrl.adminUpsertMission);
miniPassAdminRouter.delete("/mini-pass/seasons/:seasonId/missions/:missionId", ctrl.adminDeleteMission);
