import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as offerwallGgController from "./offerwallgg.controller.js";

export const offerwallGgRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const postbackLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

offerwallGgRouter.get("/postback", postbackLimiter, offerwallGgController.offerwallGgPostback);
offerwallGgRouter.post("/postback", postbackLimiter, offerwallGgController.offerwallGgPostback);

offerwallGgRouter.get("/history", requireAuth, limiter, offerwallGgController.getOfferwallGgHistory);
offerwallGgRouter.get("/stats", requireAuth, limiter, offerwallGgController.getOfferwallGgStats);
offerwallGgRouter.get("/embed", requireAuth, limiter, offerwallGgController.getOfferwallGgEmbed);
