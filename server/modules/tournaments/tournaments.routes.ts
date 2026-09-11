// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./tournaments.controller.js";
export const tournamentsRouter = express.Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 120 });
tournamentsRouter.get("/", limiter, ctrl.listTournaments);
tournamentsRouter.get("/my-history", requireAuth, limiter, ctrl.myHistory);
tournamentsRouter.get("/:id/my-score-breakdown", requireAuth, limiter, ctrl.myScoreBreakdown);
tournamentsRouter.get("/:id", limiter, ctrl.getTournament);
tournamentsRouter.get("/:id/my-rank", requireAuth, limiter, ctrl.myRank);
