import { z } from "zod";

export const idParamSchema = z
  .object({
    id: z.coerce.number().int().positive().max(2_147_483_647),
  })
  .strict();

export const seasonIdParamSchema = z
  .object({
    seasonId: z.coerce.number().int().positive().max(2_147_483_647),
  })
  .strict();

export const rewardIdParamSchema = z
  .object({
    seasonId: z.coerce.number().int().positive().max(2_147_483_647),
    rewardId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  })
  .strict();

export const missionIdParamSchema = z
  .object({
    seasonId: z.coerce.number().int().positive().max(2_147_483_647),
    missionId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  })
  .strict();

export const i18nTextSchema = z.object({
  en: z.string().trim().min(1).max(200).optional(),
  ptBR: z.string().trim().min(1).max(200).optional(),
  es: z.string().trim().min(1).max(200).optional(),
}).refine((d) => Boolean(d.en || d.ptBR || d.es), {
  message: "Title required in at least one language (en, pt-BR, or es).",
});

export const i18nDescriptionSchema = z.object({
  en: z.string().trim().min(1).max(2000).optional(),
  ptBR: z.string().trim().max(2000).optional(),
  es: z.string().trim().max(2000).optional(),
}).nullable().optional();

export const adminSeasonCreateSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    titleI18n: i18nTextSchema,
    subtitleI18n: i18nDescriptionSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    maxLevel: z.coerce.number().int().min(1).max(500).default(10),
    xpPerLevel: z.coerce.number().int().min(1).max(1_000_000).default(100),
    buyLevelPricePol: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]).default("1"),
    completePassPricePol: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]).default("10"),
    bannerImageUrl: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .strict()
  .refine((d) => d.endsAt > d.startsAt, {
    message: "endsAt must be after startsAt.",
  });

export const adminSeasonUpdateSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/).optional(),
    titleI18n: i18nTextSchema.optional(),
    subtitleI18n: i18nDescriptionSchema,
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    maxLevel: z.coerce.number().int().min(1).max(500).optional(),
    xpPerLevel: z.coerce.number().int().min(1).max(1_000_000).optional(),
    buyLevelPricePol: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
    completePassPricePol: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
    bannerImageUrl: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
