/**
 * Admin-only surface — mounted under /api/admin (requireAdminAuth applied by the parent
 * adminRouter, see server/modules/admin/admin.routes.ts). No public routes here: this
 * module is an internal dependency for fraud-signals, not an end-user API.
 */
import { Router } from "express";
import { refreshIpIntelligence } from "./ip-intelligence.controller.js";

export const ipIntelligenceAdminRouter = Router();

ipIntelligenceAdminRouter.get("/:ip", refreshIpIntelligence);
