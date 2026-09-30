/**
 * Routes for authenticated and guest support messages.
 * Includes the `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 */
import express, { type Router } from "express";
import { requireAuth, authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as supportController from "./support.controller.js";

export const supportRouter: Router = express.Router();
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
