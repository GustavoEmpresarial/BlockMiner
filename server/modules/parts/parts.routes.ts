import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as partsController from "./parts.controller.js";

export const partsRouter = express.Router();

partsRouter.get("/", requireAuth, partsController.listParts);
partsRouter.post("/merge", requireAuth, partsController.mergeParts);
partsRouter.post("/craft", requireAuth, partsController.craftPart);
