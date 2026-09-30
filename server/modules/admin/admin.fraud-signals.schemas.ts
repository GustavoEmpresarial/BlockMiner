import { z } from "zod";

export const adminFraudSignalsQuerySchema = z
  .object({
    scope: z.enum(["all", "wallets", "ips", "devices"]).optional().default("all"),
    page: z.coerce.number().int().positive("Página deve ser um número inteiro positivo.").default(1),
    limit: z.coerce.number().int().min(1, "Limite mínimo é 1.").max(100, "Limite máximo é 100.").default(40),
    q: z.string().trim().max(120, "Termo de busca muito longo.").optional(),
  })
  .strict();

export const adminFraudRefreshIpSchema = z
  .object({
    ip: z.string().trim().min(3, "IP inválido.").max(60, "IP excede tamanho máximo."),
    forceRefresh: z.boolean().optional().default(true),
  })
  .strict();

export const adminFraudResetCollectionSchema = z
  .object({
    confirm: z.string().trim().min(1, "Frase de confirmação obrigatória.").max(100),
  })
  .strict();

export type AdminFraudSignalsQuery = z.infer<typeof adminFraudSignalsQuerySchema>;
export type AdminFraudRefreshIpInput = z.infer<typeof adminFraudRefreshIpSchema>;
export type AdminFraudResetCollectionInput = z.infer<typeof adminFraudResetCollectionSchema>;
