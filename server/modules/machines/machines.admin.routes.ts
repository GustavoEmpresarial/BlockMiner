// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Admin machines routes — mounted inside adminRouter → inherits admin auth. No legacy source (see machines.admin.controller.ts). */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as machinesAdminController from "./machines.admin.controller.js";
export const machinesAdminRouter = express.Router();
machinesAdminRouter.use(requireAdminAuth);
machinesAdminRouter.get("/machines/user/:userId", machinesAdminController.adminListUserMachines);
