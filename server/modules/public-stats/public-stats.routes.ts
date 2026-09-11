/**
 * Public (unauthenticated) routes for the landing page trust strip/feed and the live
 * server stats widget. Ported from legacy's publicSurfaceRoutes.mount.ts. GET /api/live-server-stats
 * carries its own rate limiter (120/min), matching legacy's publicLiveStatsLimiter.
 */
import { Router } from "express";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as publicStatsController from "./public-stats.controller.js";
import * as publicLiveStatsController from "./public-live-stats.controller.js";

export const publicStatsRouter = Router();

publicStatsRouter.get("/public-stats", publicStatsController.getPublicStats);
publicStatsRouter.get("/public-feed", publicStatsController.getPublicFeed);

const publicLiveStatsLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
publicStatsRouter.get("/live-server-stats", publicLiveStatsLimiter, publicLiveStatsController.getLiveStats);
