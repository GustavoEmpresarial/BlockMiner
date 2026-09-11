/**
 * Ported from legacy/server/modules/banners/banner.admin.routes.ts.
 * Mounted at /api/admin — same pattern as partner-games.admin.routes.ts / media.admin.routes.ts.
 * Image upload for banners reuses the generic media admin endpoints (default category
 * "banners" for POST /api/admin/upload-media) — no banner-specific upload route in legacy.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as bannersController from "./banners.controller.js";

export const bannersAdminRouter = Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
bannersAdminRouter.use("/banners", requireAdminAuth, adminLimiter);

bannersAdminRouter.get("/banners", bannersController.adminList);
bannersAdminRouter.post("/banners", bannersController.adminCreate);
bannersAdminRouter.put("/banners/:id", bannersController.adminUpdate);
bannersAdminRouter.delete("/banners/:id", bannersController.adminDelete);
