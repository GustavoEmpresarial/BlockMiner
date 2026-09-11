/** Ported from legacy/server/modules/offerwallme/offerwallme.routes.ts. */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as offerwallmeController from "./offerwallme.controller.js";

export const offerwallMeRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const postbackLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

// offerwall.me sends GET or POST — support both.
offerwallMeRouter.get("/postback", postbackLimiter, offerwallmeController.offerwallMePostback);
offerwallMeRouter.post("/postback", postbackLimiter, offerwallmeController.offerwallMePostback);

offerwallMeRouter.get("/history", requireAuth, limiter, offerwallmeController.getOfferwallMeHistory);
offerwallMeRouter.get("/stats", requireAuth, limiter, offerwallmeController.getOfferwallMeStats);
offerwallMeRouter.get("/embed", requireAuth, limiter, offerwallmeController.getOfferwallMeEmbed);
