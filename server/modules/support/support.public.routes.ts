// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { Router } from "express";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./support.public.controller.js";
export const supportPublicRouter = Router();
const readLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });
supportPublicRouter.post("/upload-image", uploadLimiter, ctrl.uploadPublicImage);
supportPublicRouter.post("/ticket", writeLimiter, ctrl.createTicket);
supportPublicRouter.get("/tickets", readLimiter, ctrl.listTicketsByEmail);
supportPublicRouter.get("/ticket/:id", readLimiter, ctrl.getTicket);
supportPublicRouter.post("/ticket/:id/message", writeLimiter, ctrl.addGuestMessage);
