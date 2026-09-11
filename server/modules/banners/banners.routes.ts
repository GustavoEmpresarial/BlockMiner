// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Public banners route. Ported from legacy's publicSurfaceRoutes.mount.ts
 * (`app.get("/api/banners", bannerController.getActiveBanners)`) — no auth.
 */
import { Router } from "express";
import * as bannersController from "./banners.controller.js";
export const bannersRouter = Router();
bannersRouter.get("/", bannersController.getActiveBanners);
