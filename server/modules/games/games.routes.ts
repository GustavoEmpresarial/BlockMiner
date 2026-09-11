/** Ported from legacy/server/modules/games/games.routes.ts. */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as gamesPowerController from "./games.power.controller.js";
import * as gamesTurnstileController from "./games.turnstile.controller.js";
import { game2048Router } from "./game2048/game2048.routes.js";

export const gamesRouter = express.Router();

gamesRouter.get("/active-powers", requireAuth, gamesPowerController.getActiveGamePowers);
gamesRouter.get("/turnstile-status", requireAuth, gamesTurnstileController.getTurnstileStatus);
gamesRouter.post("/turnstile-pass", requireAuth, gamesTurnstileController.postTurnstilePass);
gamesRouter.use("/2048", game2048Router);
