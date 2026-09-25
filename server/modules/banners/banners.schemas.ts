import { z } from "zod";
import { BANNER_TYPE_VALUES, parseBannerUtcMidnight } from "./banners.types.js";

const DANGEROUS_PROTOCOLS = /^(javascript:|data:text\/html|vbscript:)/i;

export const createBannerSchema = z
  .object({
    title: z
      .string({ required_error: "Título é obrigatório." })
      .trim()
      .min(1, "Título é obrigatório.")
      .max(120, "Título não pode exceder 120 caracteres."),
    message: z
      .string()
      .trim()
      .max(500, "Descrição não pode exceder 500 caracteres.")
      .optional()
      .default(""),
    imageUrl: z
      .string()
      .trim()
      .max(2048, "URL da imagem muito longa.")
      .refine(
        (val) => !val || !DANGEROUS_PROTOCOLS.test(val),
        "URL de mídia insegura ou inválida.",
      )
      .nullable()
      .optional(),
    type: z.enum(BANNER_TYPE_VALUES).default("info"),
    link: z
      .string()
      .trim()
      .max(2048, "Link muito longo.")
      .refine(
        (val) => !val || !DANGEROUS_PROTOCOLS.test(val),
        "Protocolo de link inválido ou inseguro.",
      )
      .nullable()
      .optional(),
    linkLabel: z
      .string()
      .trim()
      .max(60, "Texto do botão não pode exceder 60 caracteres.")
      .nullable()
      .optional(),
    isActive: z.boolean().default(true),
    startsAt: z.unknown().optional(),
    endsAt: z.unknown().optional(),
  })
  .refine(
    (data) => {
      const start = parseBannerUtcMidnight(data.startsAt);
      const end = parseBannerUtcMidnight(data.endsAt);
      if (start && end) {
        return end.getTime() >= start.getTime();
      }
      return true;
    },
    {
      message: "A data final deve ser igual ou posterior à data inicial.",
      path: ["endsAt"],
    },
  );

export const updateBannerSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Título não pode ser vazio.")
      .max(120, "Título não pode exceder 120 caracteres.")
      .optional(),
    message: z
      .string()
      .trim()
      .max(500, "Descrição não pode exceder 500 caracteres.")
      .optional(),
    imageUrl: z
      .string()
      .trim()
      .max(2048, "URL da imagem muito longa.")
      .refine(
        (val) => !val || !DANGEROUS_PROTOCOLS.test(val),
        "URL de mídia insegura ou inválida.",
      )
      .nullable()
      .optional(),
    type: z.enum(BANNER_TYPE_VALUES).optional(),
    link: z
      .string()
      .trim()
      .max(2048, "Link muito longo.")
      .refine(
        (val) => !val || !DANGEROUS_PROTOCOLS.test(val),
        "Protocolo de link inválido ou inseguro.",
      )
      .nullable()
      .optional(),
    linkLabel: z
      .string()
      .trim()
      .max(60, "Texto do botão não pode exceder 60 caracteres.")
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    startsAt: z.unknown().optional(),
    endsAt: z.unknown().optional(),
  })
  .refine(
    (data) => {
      if (data.startsAt !== undefined && data.endsAt !== undefined) {
        const start = parseBannerUtcMidnight(data.startsAt);
        const end = parseBannerUtcMidnight(data.endsAt);
        if (start && end) {
          return end.getTime() >= start.getTime();
        }
      }
      return true;
    },
    {
      message: "A data final deve ser igual ou posterior à data inicial.",
      path: ["endsAt"],
    },
  );

export const bannerIdParamSchema = z.object({
  id: z.coerce.number().int().positive("ID do banner deve ser um número inteiro positivo."),
});
