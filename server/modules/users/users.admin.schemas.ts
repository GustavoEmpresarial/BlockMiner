import { z } from "zod";

export const adminUserIdParamSchema = z
  .object({
    id: z.coerce
      .number()
      .int()
      .positive("ID deve ser um número inteiro positivo.")
      .max(2_147_483_647, "ID excede o limite máximo permitido de 32 bits."),
  })
  .strict();

export const adminUsersListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(120).optional(),
    status: z.enum(["all", "active", "banned"]).optional().default("all"),
    fromDate: z.string().trim().datetime({ offset: true }).or(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    toDate: z.string().trim().datetime({ offset: true }).or(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  })
  .strict();

export const adminBanUserSchema = z
  .object({
    reason: z.string().trim().max(300, "Motivo deve ter no máximo 300 caracteres.").optional(),
    days: z.coerce.number().int().positive("Duração deve ser em dias positivos.").optional(),
  })
  .strict();

export const ADMIN_BALANCE_CURRENCIES = [
  "pol",
  "blk",
  "blkLocked",
  "shib",
  "btc",
  "eth",
  "usdt",
  "usdc",
  "zer",
] as const;

export type AdminBalanceCurrency = (typeof ADMIN_BALANCE_CURRENCIES)[number];

export const adminAdjustBalanceSchema = z
  .object({
    currency: z.enum(ADMIN_BALANCE_CURRENCIES, {
      message: "Moeda inválida para ajuste de saldo.",
    }),
    mode: z.enum(["set", "add"], {
      message: "Modo deve ser 'set' (definir) ou 'add' (adicionar).",
    }),
    amount: z.coerce
      .number()
      .finite("Valor deve ser um número válido.")
      .refine((n) => Math.abs(n) <= 1_000_000_000, "Valor excede o limite máximo de segurança."),
    reason: z.string().trim().max(300, "Motivo deve ter no máximo 300 caracteres.").optional(),
  })
  .strict();

export const adminResetPasswordSchema = z
  .object({
    newPassword: z.string().trim().min(6, "A senha deve ter pelo menos 6 caracteres.").max(100).optional(),
  })
  .strict();

export const adminSendMinerSchema = z
  .object({
    minerId: z.coerce
      .number()
      .int()
      .positive("ID da mineradora inválido.")
      .max(2_147_483_647),
    quantity: z.coerce
      .number()
      .int()
      .min(1, "Quantidade mínima é 1.")
      .max(50, "Quantidade máxima por concessão é 50.")
      .default(1),
  })
  .strict();

export type AdminUserIdParam = z.infer<typeof adminUserIdParamSchema>;
export type AdminUsersListQuery = z.infer<typeof adminUsersListQuerySchema>;
export type AdminBanUserInput = z.infer<typeof adminBanUserSchema>;
export type AdminAdjustBalanceInput = z.infer<typeof adminAdjustBalanceSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type AdminSendMinerInput = z.infer<typeof adminSendMinerSchema>;
