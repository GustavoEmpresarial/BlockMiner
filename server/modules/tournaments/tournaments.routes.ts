import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./tournaments.controller.js";

/** Player tournament reads — shared window with public-stats style endpoints. */
export const TOURNAMENT_PLAYER_RATE_LIMIT_WINDOW_MS = 60_000;
export const TOURNAMENT_PLAYER_RATE_LIMIT_MAX = 120;

export const tournamentsRouter = express.Router();
const limiter = createRateLimiter({
  windowMs: TOURNAMENT_PLAYER_RATE_LIMIT_WINDOW_MS,
  max: TOURNAMENT_PLAYER_RATE_LIMIT_MAX,
  name: "tournaments_player",
});

tournamentsRouter.get("/", limiter, ctrl.listTournaments);
tournamentsRouter.get("/my-history", requireAuth, limiter, ctrl.myHistory);
tournamentsRouter.get("/:id/my-score-breakdown", requireAuth, limiter, ctrl.myScoreBreakdown);
tournamentsRouter.get("/:id", limiter, ctrl.getTournament);
tournamentsRouter.get("/:id/my-rank", requireAuth, limiter, ctrl.myRank);
