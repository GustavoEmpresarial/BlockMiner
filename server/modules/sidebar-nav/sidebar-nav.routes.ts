// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Public sidebar nav route. Ported from legacy/server/modules/sidebar-nav/sidebar-nav.routes.ts.
 * CORRECTION (client-parity audit): legacy DOES mount this — at
 * legacy/backend/src/app/mount/userApiRoutes.mount.ts:76 (`app.use("/api/sidebar", ...)`), which
 * a prior pass here missed by only checking legacy/server/routes/ (the admin-route file), not
 * backend/src/app/mount/ (where this project's user/public routes are actually wired). Mounted
 * in current/'s bootstrap at "/api/sidebar" (this router defines the "/nav" sub-path), giving
 * GET /api/sidebar/nav — matching client/ (frozen), which calls exactly that path.
 */
import { Router } from "express";
import * as sidebarNavController from "./sidebar-nav.controller.js";
export const sidebarNavRouter = Router();
sidebarNavRouter.get("/nav", sidebarNavController.getPublicNav);
