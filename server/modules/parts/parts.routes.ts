import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as partsController from "./parts.controller.js";

export const partsRouter = express.Router();

// /merge and /craft debit parts and balance on every call, so they get the same write
// budget as boosts /activate. Keyed per user + path by the limiter's default key.
const partsWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: "parts_write" });

partsRouter.get("/", requireAuth, partsController.listParts);
partsRouter.post("/merge", requireAuth, partsWriteLimiter, partsController.mergeParts);
partsRouter.post("/craft", requireAuth, partsWriteLimiter, partsController.craftPart);
