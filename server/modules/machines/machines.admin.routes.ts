/** Admin machines routes — mounted inside adminRouter → inherits admin auth. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as machinesAdminController from "./machines.admin.controller.js";

export const machinesAdminRouter = express.Router();
machinesAdminRouter.use(requireAdminAuth);
machinesAdminRouter.get("/machines/user/:userId", machinesAdminController.adminListUserMachines);
