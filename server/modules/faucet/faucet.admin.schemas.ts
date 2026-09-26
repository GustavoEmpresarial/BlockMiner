import { z } from "zod";

/**
 * Regex to validate safe image URLs.
 * Allows relative web paths starting with "/" (e.g. "/media/miners/reward.webp")
 * or absolute HTTP/HTTPS URLs.
 * Rejects dangerous protocols like javascript:, data:, vbscript:, file:.
 */
const SAFE_IMAGE_URL_REGEX = /^(\/(?!\/)[a-zA-Z0-9_\-./%~]+|https?:\/\/[a-zA-Z0-9_\-.]+(:[0-9]+)?(\/[a-zA-Z0-9_\-./%~?#&=+]*)?)$/i;

export const adminFaucetConfigUpdateSchema = z
  .object({
    name: z
      .string({ invalid_type_error: "name deve ser texto." })
      .trim()
      .min(1, "O nome da mineradora não pode ser vazio.")
      .max(100, "O nome deve ter no máximo 100 caracteres.")
      .optional(),
    baseHashRate: z
      .number({ invalid_type_error: "baseHashRate deve ser numérico." })
      .positive("O hashrate base deve ser maior que zero.")
      .max(1_000_000, "O hashrate base não pode exceder 1.000.000 H/s.")
      .refine((v) => Number.isFinite(v), "baseHashRate deve ser um número finito.")
      .optional(),
    imageUrl: z
      .string({ invalid_type_error: "imageUrl deve ser texto." })
      .trim()
      .max(1000, "A URL da imagem não pode exceder 1000 caracteres.")
      .refine((val) => val === "" || SAFE_IMAGE_URL_REGEX.test(val), {
        message: "URL de imagem inválida ou protocolo não seguro (somente http, https ou /media/... são permitidos).",
      })
      .nullable()
      .optional()
      .transform((val) => (val === "" || val === null ? null : val)),
    cooldownMs: z
      .number({ invalid_type_error: "cooldownMs deve ser numérico." })
      .int("cooldownMs deve ser um número inteiro.")
      .min(60_000, "Intervalo mínimo de 1 minuto (60.000 ms).")
      .max(604_800_000, "Intervalo máximo de 7 dias (604.800.000 ms).")
      .optional(),
    isActive: z
      .boolean({ invalid_type_error: "isActive deve ser booleano." })
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.baseHashRate !== undefined ||
      data.imageUrl !== undefined ||
      data.cooldownMs !== undefined ||
      data.isActive !== undefined,
    {
      message: "Pelo menos um campo deve ser fornecido para atualização.",
    },
  );

export type AdminFaucetConfigUpdateInput = z.infer<typeof adminFaucetConfigUpdateSchema>;
