import { z } from "zod";
import {
  DEFAULT_MAX_BURN_OWNED_MACHINE_IDS,
  MAX_BURN_CLAIM_LIMIT_PER_USER,
} from "./burn-events.config.js";

export const eventIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export const startBurnBodySchema = z
  .object({
    minerIds: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .max(DEFAULT_MAX_BURN_OWNED_MACHINE_IDS),
    feeCurrency: z.enum(["SHIB", "POL", "BLK"]),
  })
  .strict();

export const claimBurnBodySchema = z
  .object({
    sessionId: z.coerce.number().int().positive(),
  })
  .strict();

const nullableTrimmedString = z.union([z.string().trim().max(2000), z.null()]).optional();

export const adminCreateBurnEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.union([z.string().trim().max(20000), z.null()]).optional(),
    imageUrl: nullableTrimmedString,
    requiredHashRate: z.coerce.number().positive(),
    rewardMinerId: z.coerce.number().int().positive(),
    /** Per-player burn completions. Default applied in service if omitted. */
    claimLimitPerUser: z.coerce.number().int().min(1).max(MAX_BURN_CLAIM_LIMIT_PER_USER).optional(),
    /** Global pool. null / omitted = unlimited. Not the per-user limit. */
    stockTotal: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
    startsAt: z.union([z.string(), z.null()]).optional(),
    endsAt: z.union([z.string(), z.null()]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const adminUpdateBurnEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.union([z.string().trim().max(20000), z.null()]).optional(),
    imageUrl: nullableTrimmedString,
    requiredHashRate: z.coerce.number().positive().optional(),
    rewardMinerId: z.coerce.number().int().positive().optional(),
    claimLimitPerUser: z.coerce.number().int().min(1).max(MAX_BURN_CLAIM_LIMIT_PER_USER).optional(),
    stockTotal: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
    startsAt: z.union([z.string(), z.null()]).optional(),
    endsAt: z.union([z.string(), z.null()]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const adminClaimsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
  })
  .strict();
