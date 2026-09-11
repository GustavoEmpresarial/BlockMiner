import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./bm-captcha.controller.js";

export const bmCaptchaRouter = express.Router();

const mintLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const verifyLimiter = createRateLimiter({ windowMs: 60_000, max: 40 });

bmCaptchaRouter.post("/challenge", requireAuth, mintLimiter, ctrl.postChallenge);
bmCaptchaRouter.post("/verify", requireAuth, verifyLimiter, ctrl.postVerify);
