// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import * as adminSupportController from "./support.admin.controller.js";
/**
 * Admin routes for Support + Public Support.
 * Paths: /api/admin/support/*, /api/admin/public-support/*
 */
export const supportAdminRouter = express.Router();
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
