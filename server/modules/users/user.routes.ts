// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import * as userController from "./user.controller.js";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
const userRouter = express.Router();
const userLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 });
userRouter.use(requireAuth, userLimiter);
userRouter.post("/change-username", userController.changeUsername);
userRouter.get("/2fa/status", userController.get2FAStatus);
userRouter.post("/2fa/generate", userController.generate2FA);
userRouter.post("/2fa/enable", userController.enable2FA);
userRouter.post("/2fa/disable", userController.disable2FA);
userRouter.get("/email-2fa/status", userController.getEmailTwoFactorStatus);
userRouter.post("/email-2fa/challenge", userController.requestEmailTwoFactorChallenge);
userRouter.post("/email-2fa/enable", userController.enableEmailTwoFactor);
userRouter.post("/email-2fa/disable", userController.disableEmailTwoFactor);
userRouter.post("/report-adblock", userController.reportAdblock);
userRouter.get("/referrals", userController.getReferrals);
userRouter.get("/referral-stats", userController.getReferralStats);
userRouter.post("/link-referral", userController.linkReferral);
export default userRouter;
export { userRouter };
