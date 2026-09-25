/**
 * Public banners route mounted at /api/banners (no authentication required).
 */
import { Router } from "express";
import * as bannersController from "./banners.controller.js";

export const bannersRouter = Router();

bannersRouter.get("/", bannersController.getActiveBanners);

