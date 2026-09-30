import { Router } from "express";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./support.public.controller.js";

export const supportPublicRouter: Router = Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

supportPublicRouter.post("/upload-image", uploadLimiter, ctrl.uploadPublicImage);
supportPublicRouter.post("/ticket", writeLimiter, ctrl.createTicket);
supportPublicRouter.get("/tickets", readLimiter, ctrl.listTicketsByEmail);
supportPublicRouter.get("/ticket/:id", readLimiter, ctrl.getTicket);
supportPublicRouter.post("/ticket/:id/message", writeLimiter, ctrl.addGuestMessage);

