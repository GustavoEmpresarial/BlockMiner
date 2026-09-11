import express from "express";
import { z } from "zod";
import * as swapController from "./swap.controller.js";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { validateBody } from "../../core/http/middleware/validate.js";

export const swapRouter = express.Router();

const swapLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

export const swapSchema = z
  .object({
    fromAsset: z.enum(["POL", "SHIB"]),
    toAsset: z.literal("BLK"),
    amount: z.union([z.string().trim(), z.number()]),
  })
  .strict();

swapRouter.get("/balances", requireAuth, swapLimiter, swapController.getBalances);
swapRouter.post("/execute", requireAuth, swapLimiter, validateBody(swapSchema), swapController.executeSwap);
