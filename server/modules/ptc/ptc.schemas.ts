import { z } from "zod";

function isHttpUrl(value: unknown): boolean {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const createCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).default(""),
    url: z.string().trim().min(1).max(2048).refine(isHttpUrl, "url must be a valid http(s) URL"),
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
    currency: z.enum(["SHIB", "POL", "BLK"]).default("SHIB"),
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
    currency: z.enum(["SHIB", "POL", "BLK"]).optional(),
    isActive: z.coerce.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
})
    .strict();
export const adminRejectCampaignSchema = z
    .object({
    reason: z.string().trim().min(1).max(500).default("Policy violation"),
})
    .strict();
