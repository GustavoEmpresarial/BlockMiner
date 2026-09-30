import { Router } from "express";
import * as sidebarNavController from "./sidebar-nav.controller.js";

export const sidebarNavRouter: Router = Router();

sidebarNavRouter.get("/nav", sidebarNavController.getPublicNav);

