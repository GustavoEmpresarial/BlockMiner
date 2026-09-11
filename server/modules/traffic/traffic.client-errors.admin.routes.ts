// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/traffic/clientErrors.admin.routes.ts. Full paths /api/admin/client-errors unchanged. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import { adminClearClientErrors, adminListClientErrors } from "./traffic.client-errors.admin.controller.js";
export const clientErrorsAdminRouter = express.Router();
clientErrorsAdminRouter.use(requireAdminAuth);
clientErrorsAdminRouter.get("/client-errors", adminListClientErrors);
clientErrorsAdminRouter.delete("/client-errors", adminClearClientErrors);
