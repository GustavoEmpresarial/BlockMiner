import express, { type Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { validateBody } from "../../core/http/middleware/validate.js";
import { AVATAR_CHANNELS, AVATAR_CURRENCIES } from "./avatar.rules.js";
import * as avatarController from "./avatar.controller.js";

export const avatarRouter: Router = express.Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export const avatarPurchaseSchema = z
  .object({
    currency: z.enum(AVATAR_CURRENCIES),
    expectedAmount: z.union([z.string().trim().max(40), z.number()]),
    channel: z.enum(AVATAR_CHANNELS).optional(),
  })
  .strict();

avatarRouter.get("/", requireAuth, readLimiter, avatarController.getStatus);
avatarRouter.post("/license", requireAuth, writeLimiter, validateBody(avatarPurchaseSchema), avatarController.purchaseLicense);
avatarRouter.post("/photo", requireAuth, writeLimiter, avatarController.uploadGate, avatarController.avatarUploadMiddleware, avatarController.uploadPhoto);
avatarRouter.delete("/photo", requireAuth, writeLimiter, avatarController.deletePhoto);
