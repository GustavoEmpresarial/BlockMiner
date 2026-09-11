// @ts-nocheck — restored from dist for compile; refine later
import { z } from "zod";
// Caps mirram login/register (bcrypt só usa os primeiros 72 bytes) — sem isso, um usuário
// autenticado podia mandar um newPassword gigante (até o limite global de 2mb do express.json)
// pro bcrypt processar sem necessidade nenhuma.
export const changePasswordSchema = z
    .object({
    currentPassword: z.string().max(72),
    newPassword: z.string().min(8).max(72),
})
    .strict();
export const forgotPasswordSchema = z
    .object({
    email: z
        .string()
        .trim()
        .toLowerCase()
        .min(1, "Email é obrigatório.")
        .max(254, "Email muito longo.")
        .email("Email inválido."),
})
    .strict();
