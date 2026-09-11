import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as miniPass from "./mini-pass.controller.js";

export const miniPassRouter = Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 40 });

miniPassRouter.get("/seasons", requireAuth, limiter, miniPass.listMiniPassSeasons);
miniPassRouter.get("/seasons/:seasonId", requireAuth, limiter, miniPass.getMiniPassSeason);
miniPassRouter.post(
  "/seasons/:seasonId/claim/:levelRewardId",
  requireAuth,
  writeLimiter,
  miniPass.postClaimMiniPassReward,
);
miniPassRouter.post(
  "/seasons/:seasonId/buy-level",
  requireAuth,
  writeLimiter,
  miniPass.postBuyMiniPassLevels,
);
miniPassRouter.post(
  "/seasons/:seasonId/complete-pass",
  requireAuth,
  writeLimiter,
  miniPass.postCompleteMiniPass,
);
