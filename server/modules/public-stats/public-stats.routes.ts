/**
 * Public (unauthenticated) routes for the landing page trust strip/feed and the live
 * server stats widget. Ported from legacy's publicSurfaceRoutes.mount.ts. GET /api/live-server-stats
 * carries its own rate limiter (120/min), matching legacy's publicLiveStatsLimiter.
 *
 * Security audit (2026-09-11): /public-stats and /public-feed were the only two routes on
 * this unauthenticated, DB-touching public surface with NO rate limiter at all — unlike
 * every other landing/auth endpoint (see auth.routes.ts) and unlike /live-server-stats right
 * below. Each hit runs a user count + a transaction aggregate + two 10-row findMany queries;
 * with zero throttling this was an open resource-exhaustion vector against Postgres. Fixed by
 * giving both the same per-IP limiter shape already used everywhere else on this surface.
 */
import { Router } from "express";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as publicStatsController from "./public-stats.controller.js";
import * as publicLiveStatsController from "./public-live-stats.controller.js";

export const publicStatsRouter = Router();

const publicStatsLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: "public_stats_ip" });
publicStatsRouter.get("/public-stats", publicStatsLimiter, publicStatsController.getPublicStats);
publicStatsRouter.get("/public-feed", publicStatsLimiter, publicStatsController.getPublicFeed);

const publicLiveStatsLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: "public_live_stats_ip" });
publicStatsRouter.get("/live-server-stats", publicLiveStatsLimiter, publicLiveStatsController.getLiveStats);
