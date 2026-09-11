/** Ported from legacy/server/modules/partnerGames/partnerGames.routes.ts (public router half). */
import { Router } from "express";
import { requireAuth, authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./partner-games.controller.js";

export const partnerGamesRouter = Router();

const proxyImageRateLimiter = createRateLimiter({ windowMs: 60_000, max: 60, message: "Muitas requisições de imagem. Aguarde um instante." });
partnerGamesRouter.get("/proxy-image", proxyImageRateLimiter, ctrl.proxyPartnerGameImage);

const voteRateLimiter = createRateLimiter({ windowMs: 60_000, max: 30, message: "Muitos votos em pouco tempo. Aguarde um instante." });

partnerGamesRouter.get("/", authenticateTokenOptional, ctrl.listPartnerGamesPublic);

const sessionRateLimiter = createRateLimiter({ windowMs: 60_000, max: 120, message: "Muitas requisições de sessão. Aguarde um instante." });

partnerGamesRouter.get("/play/:slug", authenticateTokenOptional, ctrl.getPartnerGameBySlugPublic);
partnerGamesRouter.post("/session/start", requireAuth, sessionRateLimiter, ctrl.startPartnerGameSessionHandler);
partnerGamesRouter.post("/session/:sessionId/heartbeat", requireAuth, sessionRateLimiter, ctrl.heartbeatPartnerGameSessionHandler);
partnerGamesRouter.post("/session/:sessionId/end", requireAuth, sessionRateLimiter, ctrl.endPartnerGameSessionHandler);
partnerGamesRouter.get("/session/stats/:slug", requireAuth, ctrl.getPartnerGameSessionStatsHandler);

partnerGamesRouter.post("/:id/vote", requireAuth, voteRateLimiter, ctrl.votePartnerGame);
