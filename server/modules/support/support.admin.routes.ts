import express, { type Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import * as adminSupportController from "./support.admin.controller.js";

/**
 * Admin routes for Support + Public Support.
 * Paths: /api/admin/support/*, /api/admin/public-support/*
 */
export const supportAdminRouter: Router = express.Router();
supportAdminRouter.use(requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "support_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "support_admin_write",
});

const creditLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 60,
  name: "support_admin_credit",
});

supportAdminRouter.get(
  "/support",
  readLimiter,
  requireAdminPermission("support.view", "support"),
  adminSupportController.listMessages
);
supportAdminRouter.get(
  "/support/:id/player-dossier",
  readLimiter,
  requireAdminPermission("support.view", "support"),
  adminSupportController.getPlayerDossier
);
supportAdminRouter.get(
  "/support/:id",
  readLimiter,
  requireAdminPermission("support.view", "support"),
  adminSupportController.getMessage
);
supportAdminRouter.post(
  "/support/:id/reply",
  writeLimiter,
  requireAdminPermission("support"),
  adminSupportController.replyToMessage
);
supportAdminRouter.post(
  "/support/:id/archive",
  writeLimiter,
  requireAdminPermission("support"),
  adminSupportController.setArchived
);
supportAdminRouter.post(
  "/support/:id/credit-pol",
  creditLimiter,
  requireAdminPermission("support"),
  adminSupportController.creditPol
);
supportAdminRouter.post(
  "/support/cleanup-retention",
  writeLimiter,
  requireAdminPermission("support"),
  adminSupportController.cleanupRetention
);

supportAdminRouter.get(
  "/public-support/tickets",
  readLimiter,
  requireAdminPermission("support.view", "support"),
  adminSupportController.adminListPublicTickets
);

supportAdminRouter.get(
  "/public-support/ticket/:id",
  readLimiter,
  requireAdminPermission("support.view", "support"),
  adminSupportController.adminGetPublicTicket
);

supportAdminRouter.post(
  "/public-support/ticket/:id/message",
  writeLimiter,
  requireAdminPermission("support"),
  adminSupportController.adminReplyPublicTicket
);

supportAdminRouter.patch(
  "/public-support/ticket/:id/status",
  writeLimiter,
  requireAdminPermission("support"),
  adminSupportController.adminSetPublicTicketStatus
);


