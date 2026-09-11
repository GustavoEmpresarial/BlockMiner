/** zod .strict() input validation for internal-offerwall routes. Deeper business validation
 *  (iframe host allowlist, reward-kind cross-field checks, host auto-registration) stays in
 *  internal-offerwall.service.ts's parseAdminOfferBody — same split legacy used with admin-dto.ts. */
import { z } from "zod";
import { COMPLETION_ADMIN_APPROVAL, COMPLETION_USER_SELF_CLAIM, OFFER_KIND_GENERAL_TASK, OFFER_KIND_PTC_IFRAME, REWARD_BLK } from "./internal-offerwall.config.js";

export const idParamSchema = z
  .object({ id: z.coerce.number().int().positive() })
  .strict();

export const offerIdParamSchema = z
  .object({ offerId: z.coerce.number().int().positive() })
  .strict();

export const attemptIdParamSchema = z
  .object({ attemptId: z.coerce.number().int().positive() })
  .strict();

export const adminOfferBodySchema = z
  .object({
    kind: z.enum([OFFER_KIND_PTC_IFRAME, OFFER_KIND_GENERAL_TASK]),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).nullable().optional(),
    iframeUrl: z.string().trim().max(2048).nullable().optional(),
    minViewSeconds: z.coerce.number().int().min(0).max(7200).optional(),
    dailyLimitPerUser: z.coerce.number().int().min(1).max(50).optional(),
    maxExecutionsPerPeriod: z.coerce.number().int().min(1).max(50).optional(),
    sortOrder: z.coerce.number().int().min(0).max(99999).optional(),
    isActive: z.boolean().optional(),
    completionMode: z.enum([COMPLETION_USER_SELF_CLAIM, COMPLETION_ADMIN_APPROVAL]).optional(),
    rewardKind: z.enum([REWARD_BLK]).default(REWARD_BLK),
    rewardBlkAmount: z.union([z.coerce.number(), z.string()]).optional(),
    rewardPolAmount: z.union([z.coerce.number(), z.string()]).optional(),
    rewardHashRate: z.union([z.coerce.number(), z.string()]).optional(),
    rewardHashRateDays: z.coerce.number().int().min(1).max(365).optional(),
    taskMetadata: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export const adminRejectAttemptBodySchema = z
  .object({ note: z.string().trim().max(2000).nullable().optional() })
  .strict();

export const adminListAttemptsQuerySchema = z
  .object({
    status: z.string().trim().max(64).optional(),
    offerId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  })
  .strict();
