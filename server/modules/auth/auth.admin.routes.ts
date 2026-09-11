// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { adminLoginPost, adminCheckGet, adminLogoutPost } from "./auth.admin.controller.js";
export const authAdminRouter = express.Router();
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, message: "Many login attempts. Try again in 15 minutes." });
// POST /api/admin/auth/login
authAdminRouter.post("/login", loginLimiter, adminLoginPost);
// GET /api/admin/auth/check
authAdminRouter.get("/check", adminCheckGet);
// POST /api/admin/auth/logout
authAdminRouter.post("/logout", adminLogoutPost);
