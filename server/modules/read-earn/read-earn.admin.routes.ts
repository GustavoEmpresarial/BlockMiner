// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/read-earn/readEarn.admin.routes.ts. Full paths /api/admin/read-earn/campaigns[/:id] unchanged. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as adminReadEarnController from "./read-earn.admin.controller.js";
export const readEarnAdminRouter = express.Router();
readEarnAdminRouter.use(requireAdminAuth);
readEarnAdminRouter.get("/read-earn/campaigns", adminReadEarnController.adminListReadEarnCampaigns);
readEarnAdminRouter.post("/read-earn/campaigns", adminReadEarnController.adminCreateReadEarnCampaign);
readEarnAdminRouter.put("/read-earn/campaigns/:id", adminReadEarnController.adminUpdateReadEarnCampaign);
readEarnAdminRouter.delete("/read-earn/campaigns/:id", adminReadEarnController.adminDeleteReadEarnCampaign);
readEarnAdminRouter.get("/read-earn/campaigns/:id/redemptions", adminReadEarnController.adminListReadEarnRedemptions);
