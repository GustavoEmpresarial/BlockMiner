import { z } from "zod";

export const publicSupportIdParamSchema = z
  .object({
    id: z.coerce
      .number()
      .int()
      .positive("ID deve ser um número inteiro positivo.")
      .max(2_147_483_647, "ID excede o limite máximo permitido de 32 bits."),
  })
  .strict();

export const adminPublicSupportQuerySchema = z
  .object({
    status: z.enum(["all", "open", "closed"]).optional().default("all"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(30),
  })
  .strict();

export const adminReplyPublicTicketSchema = z
  .object({
    message: z.string().trim().max(10_000, "Mensagem não pode exceder 10.000 caracteres.").optional(),
    imageUrl: z.string().trim().max(1000, "URL da imagem inválida.").nullable().optional(),
  })
  .strict()
  .refine(
    (data) => (Boolean(data.message) && data.message!.length > 0) || Boolean(data.imageUrl),
    {
      message: "É necessário fornecer texto de resposta ou imagem.",
      path: ["message"],
    }
  );

export const adminSetPublicTicketStatusSchema = z
  .object({
    status: z.enum(["open", "closed"], {
      message: "Status deve ser 'open' ou 'closed'.",
    }),
  })
  .strict();

export type PublicSupportIdParam = z.infer<typeof publicSupportIdParamSchema>;
export type AdminPublicSupportQuery = z.infer<typeof adminPublicSupportQuerySchema>;
export type AdminReplyPublicTicketInput = z.infer<typeof adminReplyPublicTicketSchema>;
export type AdminSetPublicTicketStatusInput = z.infer<typeof adminSetPublicTicketStatusSchema>;
