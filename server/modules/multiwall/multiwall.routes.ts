import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as multiwallController from "./multiwall.controller.js";

export const multiwallRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const postbackLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

multiwallRouter.get("/postback", postbackLimiter, multiwallController.multiwallPostback);
multiwallRouter.post("/postback", postbackLimiter, multiwallController.multiwallPostback);

multiwallRouter.get("/history", requireAuth, limiter, multiwallController.getMultiwallHistory);
multiwallRouter.get("/stats", requireAuth, limiter, multiwallController.getMultiwallStats);
multiwallRouter.get("/embed", requireAuth, limiter, multiwallController.getMultiwallEmbed);
