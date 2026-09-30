import { z } from "zod";

export const antibotIdParamSchema = z
  .object({
    id: z.coerce
      .number()
      .int()
      .positive("ID deve ser um número inteiro positivo.")
      .max(2_147_483_647, "ID excede o limite de 32 bits."),
  })
  .strict();

export const antibotUserIdParamSchema = z
  .object({
    id: z.coerce
      .number()
      .int()
      .positive("ID de usuário deve ser um número inteiro positivo.")
      .max(2_147_483_647, "ID de usuário excede o limite de 32 bits."),
  })
  .strict();

export const adminAntibotOverviewQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const adminAntibotListEvidenceQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    userId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
    detector: z.string().trim().max(80).optional(),
    code: z.string().trim().max(80).optional(),
    severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  })
  .strict();

export const adminAntibotListSessionsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    userId: z.coerce.number().int().positive().max(2_147_483_647).optional(),
    deviceId: z.string().trim().max(120).optional(),
    ip: z.string().trim().max(60).optional(),
  })
  .strict();

export const adminAntibotListDevicesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    minAccounts: z.coerce.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const adminAntibotListAlertsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    status: z.enum(["open", "acknowledged", "resolved"]).optional(),
    severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
  })
  .strict();

export const adminUpdateAlertSchema = z
  .object({
    status: z.enum(["open", "acknowledged", "resolved"], {
      message: "Status deve ser 'open', 'acknowledged' ou 'resolved'.",
    }),
  })
  .strict();

export const adminSetTrustedSchema = z
  .object({
    trusted: z.boolean().default(true),
    reason: z.string().trim().max(300, "Motivo deve ter no máximo 300 caracteres.").nullable().optional(),
  })
  .strict();

export const adminUserProfileQuerySchema = z
  .object({
    evidenceLimit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export type AntibotIdParam = z.infer<typeof antibotIdParamSchema>;
export type AntibotUserIdParam = z.infer<typeof antibotUserIdParamSchema>;
export type AdminAntibotOverviewQuery = z.infer<typeof adminAntibotOverviewQuerySchema>;
export type AdminAntibotListEvidenceQuery = z.infer<typeof adminAntibotListEvidenceQuerySchema>;
export type AdminAntibotListSessionsQuery = z.infer<typeof adminAntibotListSessionsQuerySchema>;
export type AdminAntibotListDevicesQuery = z.infer<typeof adminAntibotListDevicesQuerySchema>;
export type AdminAntibotListAlertsQuery = z.infer<typeof adminAntibotListAlertsQuerySchema>;
export type AdminUpdateAlertInput = z.infer<typeof adminUpdateAlertSchema>;
export type AdminSetTrustedInput = z.infer<typeof adminSetTrustedSchema>;
export type AdminUserProfileQuery = z.infer<typeof adminUserProfileQuerySchema>;
