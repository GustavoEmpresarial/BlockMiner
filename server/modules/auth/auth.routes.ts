/**
 * Auth HTTP routes — login/register/session + SatsPay OAuth.
 * Restored from dist and extended for SatsPay.
 */
import express from "express";
import { createDistributedRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { validateBody } from "../../core/http/middleware/validate.js";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { getRequestIp } from "../../shared/http/clientIp.js";
import { registerBodySchema } from "./register/registerBodySchema.js";
import { requireTurnstileWhenConfigured } from "../../shared/security/turnstile.js";
import { loginSchema } from "./login/login.schemas.js";
import { changePasswordSchema, forgotPasswordSchema } from "./auth.schemas.js";
import { loginPost } from "./login/login.controller.js";
import { registerPost } from "./register/register.controller.js";
import { getSession, logoutPost, markAdblockPost, refreshPost } from "../session/index.js";
import * as AuthCtrl from "./auth.controller.js";
import { satspayExchangeSchema } from "./satspay/satspay.schemas.js";
import { satspayCallbackGet, satspayConfigGet, satspayExchangePost } from "./satspay/satspay.controller.js";
import { googleExchangeSchema } from "./google/google.schemas.js";
import { googleCallbackGet, googleConfigGet, googleExchangePost } from "./google/google.controller.js";

export const authRouter = express.Router();

const authLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 24,
  name: "auth_login_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});
const passwordResetCompleteLimiter = createDistributedRateLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  name: "auth_pwd_reset_complete_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});
const adminManualPasswordResetLimiter = createDistributedRateLimiter({
  windowMs: 15 * 60_000,
  max: 8,
  name: "auth_admin_pwd_reset_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});
const refreshLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 60,
  name: "auth_refresh_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});
const sessionLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "auth_session_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});
const satspayLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 20,
  name: "auth_satspay_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});
const googleLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 20,
  name: "auth_google_ip",
  keyGenerator: (req) => `ip:${getRequestIp(req)}`,
});

authRouter.post(
  "/register",
  authLimiter,
  validateBody(registerBodySchema),
  requireTurnstileWhenConfigured({ purpose: "register" }),
  registerPost,
);
authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  requireTurnstileWhenConfigured({ purpose: "login" }),
  loginPost,
);
authRouter.get("/session", sessionLimiter, getSession);
authRouter.post("/refresh", refreshLimiter, refreshPost);
authRouter.post("/logout", logoutPost);
authRouter.post("/mark-adblock", requireAuth, markAdblockPost);
authRouter.post("/legacy-password-reset", passwordResetCompleteLimiter, AuthCtrl.legacyPasswordResetPost);
authRouter.post("/reset-password-manual", adminManualPasswordResetLimiter, AuthCtrl.resetPasswordManualPost);
authRouter.post(
  "/forgot-password",
  authLimiter,
  validateBody(forgotPasswordSchema),
  requireTurnstileWhenConfigured({ purpose: "forgot" }),
  AuthCtrl.forgotPasswordPost,
);
authRouter.post("/admin/force-password-reset", adminManualPasswordResetLimiter, AuthCtrl.adminForcePasswordResetPost);
authRouter.post("/change-password", requireAuth, validateBody(changePasswordSchema), AuthCtrl.changePasswordPost);
authRouter.post("/verify-email", passwordResetCompleteLimiter, AuthCtrl.verifyEmailPost);
authRouter.post("/resend-verification", requireAuth, authLimiter, AuthCtrl.resendVerificationPost);

// SatsPay OAuth 2.0
authRouter.get("/satspay/config", sessionLimiter, satspayConfigGet);
authRouter.post("/satspay", satspayLimiter, validateBody(satspayExchangeSchema), satspayExchangePost);
authRouter.get("/satspay/callback", satspayLimiter, satspayCallbackGet);

// Google OAuth 2.0
authRouter.get("/google/config", sessionLimiter, googleConfigGet);
authRouter.post("/google", googleLimiter, validateBody(googleExchangeSchema), googleExchangePost);
authRouter.get("/google/callback", googleLimiter, googleCallbackGet);
