/** Ported from legacy/server/modules/games/game2048.routes.ts. */
import express from "express";
import { requireAuth } from "../../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../../core/http/middleware/rateLimit.js";
import * as game2048Controller from "./game2048.controller.js";

export const game2048Router = express.Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 90 });

game2048Router.get("/status", requireAuth, readLimiter, game2048Controller.getStatus);
game2048Router.post("/start", requireAuth, writeLimiter, game2048Controller.postStart);
game2048Router.post("/restart", requireAuth, writeLimiter, game2048Controller.postRestart);
game2048Router.post("/move", requireAuth, writeLimiter, game2048Controller.postMove);
game2048Router.post("/claim", requireAuth, writeLimiter, game2048Controller.postClaim);
