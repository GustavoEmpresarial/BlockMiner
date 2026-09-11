// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * New zod validation on top of legacy/server/modules/ptc/ptc.controller.ts's manual
 * `if (!title || !url) ...` checks — doctrine requires `.strict()` zod schemas at the
 * controller boundary (see current/server/modules/read-earn/read-earn.schemas.ts), legacy
 * didn't have this. Stricter than legacy, never looser.
 */
import { z } from "zod";
export const createCampaignSchema = z
    .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    url: z.string().trim().min(1).max(2048),
    tierId: z.coerce.number().int().positive(),
    targetViews: z.coerce.number().int().positive(),
})
    .strict();
export const editCampaignSchema = z
    .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    active: z.coerce.boolean().optional(),
})
    .strict();
export const viewsAdjustSchema = z
    .object({
    views: z.coerce.number().int().positive(),
})
    .strict();
export const startSessionSchema = z
    .object({
    adId: z.coerce.number().int().positive(),
})
    .strict();
export const cancelSessionSchema = z
    .object({
    reason: z.string().trim().min(1).max(200).default("user_cancelled"),
})
    .strict();
export const adminUpdateSettingsSchema = z
    .object({
    pricePerViewShib: z.coerce.number().finite().nonnegative().optional(),
    rewardPerViewShib: z.coerce.number().finite().nonnegative().optional(),
    minDurationSeconds: z.coerce.number().int().positive().optional(),
    maxDurationSeconds: z.coerce.number().int().positive().optional(),
    minViews: z.coerce.number().int().positive().optional(),
    maxViews: z.coerce.number().int().positive().optional(),
    isEnabled: z.coerce.boolean().optional(),
})
    .strict();
export const adminCreateTierSchema = z
    .object({
    label: z.string().trim().min(1).max(200),
    adType: z.enum(["window", "iframe"]).default("window"),
    durationSeconds: z.coerce.number().int().positive(),
    pricePerViewShib: z.coerce.number().finite().nonnegative(),
    rewardPerViewShib: z.coerce.number().finite().nonnegative(),
    isActive: z.coerce.boolean().default(true),
    sortOrder: z.coerce.number().int().default(0),
})
    .strict();
export const adminUpdateTierSchema = z
    .object({
    label: z.string().trim().min(1).max(200).optional(),
    adType: z.enum(["window", "iframe"]).optional(),
    durationSeconds: z.coerce.number().int().positive().optional(),
    pricePerViewShib: z.coerce.number().finite().nonnegative().optional(),
    rewardPerViewShib: z.coerce.number().finite().nonnegative().optional(),
    isActive: z.coerce.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
})
    .strict();
export const adminRejectCampaignSchema = z
    .object({
    reason: z.string().trim().min(1).max(500).default("Policy violation"),
})
    .strict();
