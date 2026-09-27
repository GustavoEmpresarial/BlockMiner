/** Ported from legacy/server/modules/read-earn/readEarn.admin.routes.ts. Full paths /api/admin/read-earn/campaigns[/:id] unchanged. */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import * as adminReadEarnController from "./read-earn.admin.controller.js";

export const readEarnAdminRouter = express.Router();
readEarnAdminRouter.use(requireAdminAuth);

readEarnAdminRouter.get(
  "/read-earn/campaigns",
  requireAdminPermission("read_earn.view", "read_earn"),
  adminReadEarnController.adminListReadEarnCampaigns,
);

readEarnAdminRouter.post(
  "/read-earn/campaigns",
  requireAdminPermission("read_earn"),
  adminReadEarnController.adminCreateReadEarnCampaign,
);

readEarnAdminRouter.put(
  "/read-earn/campaigns/:id",
  requireAdminPermission("read_earn"),
  adminReadEarnController.adminUpdateReadEarnCampaign,
);

readEarnAdminRouter.delete(
  "/read-earn/campaigns/:id",
  requireAdminPermission("read_earn"),
  adminReadEarnController.adminDeleteReadEarnCampaign,
);

readEarnAdminRouter.get(
  "/read-earn/campaigns/:id/redemptions",
  requireAdminPermission("read_earn.view", "read_earn"),
  adminReadEarnController.adminListReadEarnRedemptions,
);


