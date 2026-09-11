// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/partnerGames/partnerGames.routes.ts (admin router half).
 * Mounted at /api/admin — same pattern as checkin.admin.routes.ts / mining.admin.routes.ts.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as adminCtrl from "./partner-games.admin.controller.js";
export const partnerGamesAdminRouter = Router();
const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
partnerGamesAdminRouter.use("/partner-games", requireAdminAuth, adminLimiter);
partnerGamesAdminRouter.get("/partner-games", adminCtrl.adminListPartnerGames);
partnerGamesAdminRouter.post("/partner-games/upload-cover", adminCtrl.uploadPartnerGameCover);
partnerGamesAdminRouter.post("/partner-games", adminCtrl.adminCreatePartnerGame);
partnerGamesAdminRouter.put("/partner-games/:id", adminCtrl.adminUpdatePartnerGame);
partnerGamesAdminRouter.delete("/partner-games/:id", adminCtrl.adminDeletePartnerGame);
