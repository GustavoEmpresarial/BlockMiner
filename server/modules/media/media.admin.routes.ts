// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/uploads/uploads.admin.routes.ts. Two generic admin endpoints
 * for ad-hoc image/media uploads (event/miner covers, banner media). Category comes via
 * `?category=` (query param, not multipart field — must be known before multer streams the file).
 * Mounted at /api/admin — same pattern as partner-games.admin.routes.ts.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { genericImageUpload, genericMediaUpload } from "./media.service.js";
import { mediaUploadErrorHandler, uploadImage, uploadMedia } from "./media.controller.js";
export const mediaAdminRouter = Router();
const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
mediaAdminRouter.use(["/upload-image", "/upload-media"], requireAdminAuth, adminLimiter);
mediaAdminRouter.post("/upload-image", genericImageUpload.single("image"), uploadImage, mediaUploadErrorHandler);
mediaAdminRouter.post("/upload-media", genericMediaUpload.single("media"), uploadMedia, mediaUploadErrorHandler);
