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

