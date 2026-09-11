/**
 * Ported from legacy/server/modules/moneyrain/moneyrain.routes.ts + index.ts.
 * Deviation: legacy wired `/callback` in its own index.ts as a bare export mounted
 * separately (S2S postback, no requireAuth). Kept the same shape here — `/callback`
 * has no requireAuth (external caller can't send our session cookie), just a rate limit
 * plus its own HMAC verification inside the service layer.
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as moneyrainController from "./moneyrain.controller.js";

export const moneyRainRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
// Matches legacy publicSurfaceRoutes.mount.ts moneyRainCallbackLimiter (30/min).
const callbackLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

moneyRainRouter.post("/callback", callbackLimiter, moneyrainController.moneyRainCallback);

moneyRainRouter.get("/link", requireAuth, limiter, moneyrainController.getMoneyRainLink);
moneyRainRouter.get("/history", requireAuth, limiter, moneyrainController.getMoneyRainHistory);
moneyRainRouter.get("/stats", requireAuth, limiter, moneyrainController.getMoneyRainStats);
