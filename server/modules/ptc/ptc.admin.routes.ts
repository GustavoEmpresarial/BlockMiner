/** Ported from legacy/server/modules/ptc/ptc.routes.ts (admin router half). Full paths /api/admin/ptc/* unchanged. */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import * as adminCtrl from "./ptc.admin.controller.js";

export const ptcAdminRouter = express.Router();
ptcAdminRouter.use(requireAdminAuth);

ptcAdminRouter.get(
  "/ptc/settings",
  requireAdminPermission("ptc.view", "ptc"),
  adminCtrl.getSettings,
);

ptcAdminRouter.put(
  "/ptc/settings",
  requireAdminPermission("ptc"),
  adminCtrl.updateSettings,
);

ptcAdminRouter.get(
  "/ptc/campaigns/pending",
  requireAdminPermission("ptc.view", "ptc"),
  adminCtrl.listPending,
);

ptcAdminRouter.get(
  "/ptc/campaigns",
  requireAdminPermission("ptc.view", "ptc"),
  adminCtrl.listAll,
);

ptcAdminRouter.post(
  "/ptc/campaigns/:id/approve",
  requireAdminPermission("ptc"),
  adminCtrl.approve,
);

ptcAdminRouter.post(
  "/ptc/campaigns/:id/reject",
  requireAdminPermission("ptc"),
  adminCtrl.reject,
);

ptcAdminRouter.get(
  "/ptc/tiers",
  requireAdminPermission("ptc.view", "ptc"),
  adminCtrl.getTiers,
);

ptcAdminRouter.post(
  "/ptc/tiers",
  requireAdminPermission("ptc"),
  adminCtrl.createTier,
);

ptcAdminRouter.put(
  "/ptc/tiers/:id",
  requireAdminPermission("ptc"),
  adminCtrl.updateTier,
);

ptcAdminRouter.delete(
  "/ptc/tiers/:id",
  requireAdminPermission("ptc"),
  adminCtrl.deleteTier,
);

