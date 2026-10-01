import { z } from "zod";

/**
 * Validation schema for admin traffic query parameters.
 * Enforces strict integer days in range [1, 365] and rejects rogue fields.
 */
export const adminTrafficQuerySchema = z
  .object({
    days: z
      .preprocess((val) => {
        if (val === undefined || val === null || val === "") return 30;
        const n = Number(val);
        return Number.isFinite(n) ? n : NaN;
      }, z.number().int({ message: "O período em dias deve ser um número inteiro." }).min(1, { message: "O período mínimo é de 1 dia." }).max(365, { message: "O período máximo é de 365 dias." }))
      .default(30),
  })
  .strict({ message: "Parâmetros desconhecidos na requisição." });

export type AdminTrafficQueryParams = z.infer<typeof adminTrafficQuerySchema>;
