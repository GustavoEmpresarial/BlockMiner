import express, { type Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import * as adminSupportController from "./support.admin.controller.js";

/**
 * Admin routes for Support + Public Support.
 * Paths: /api/admin/support/*, /api/admin/public-support/*
 */
export const supportAdminRouter: Router = express.Router();
supportAdminRouter.use(requireAdminAuth);

supportAdminRouter.get("/support", adminSupportController.listMessages);
supportAdminRouter.get("/support/:id/player-dossier", adminSupportController.getPlayerDossier);
supportAdminRouter.post("/support/:id/credit-pol", adminSupportController.creditPol);
supportAdminRouter.get("/support/:id", adminSupportController.getMessage);
supportAdminRouter.post("/support/:id/reply", adminSupportController.replyToMessage);
supportAdminRouter.post("/support/:id/archive", adminSupportController.setArchived);

supportAdminRouter.get("/public-support/tickets", adminSupportController.adminListPublicTickets);
supportAdminRouter.get("/public-support/ticket/:id", adminSupportController.adminGetPublicTicket);
supportAdminRouter.post("/public-support/ticket/:id/message", adminSupportController.adminReplyPublicTicket);
supportAdminRouter.patch("/public-support/ticket/:id/status", adminSupportController.adminSetPublicTicketStatus);

