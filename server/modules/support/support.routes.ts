// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/support/support.routes.ts, incl. the
 * `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 * Note: legacy does NOT gate POST /upload-image — matches here (see legacy
 * server/modules/support/support.routes.ts).
 */
import express from "express";
import { requireAuth, authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as supportController from "./support.controller.js";
export const supportRouter = express.Router();
const supportLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
});
const supportUploadLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
});
const supportPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.support.path, "support");
const gate = requireVisibleSidebarPath(supportPath);
supportRouter.post("/", gate, supportLimiter, authenticateTokenOptional, supportController.createMessage);
supportRouter.get("/", requireAuth, gate, supportController.listMessages);
supportRouter.post("/upload-image", supportUploadLimiter, requireAuth, supportController.uploadSupportImage);
supportRouter.get("/:id", requireAuth, gate, supportController.getMessage);
supportRouter.post("/:id/reply", supportLimiter, requireAuth, gate, supportController.replyToMessage);
