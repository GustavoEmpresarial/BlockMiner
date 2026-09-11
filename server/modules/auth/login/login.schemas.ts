import { z } from "zod";

/** Aligned with client email input + bcrypt 72-byte cap. */
export const LOGIN_BODY_IDENTIFIER_MAX = 254;
export const LOGIN_BODY_PASSWORD_MAX = 72;

// Strip ASCII control chars (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F) via char
// codes (built at runtime) so no literal control byte lives in source.
const CONTROL_CODES = [
  ...Array.from({ length: 9 }, (_, i) => i), // 0x00-0x08
  0x0b,
  0x0c,
  ...Array.from({ length: 18 }, (_, i) => 0x0e + i), // 0x0E-0x1F
  0x7f,
];
const CONTROL_CHARS_RE = new RegExp(
  `[${CONTROL_CODES.map((c) => String.fromCharCode(c)).join("")}]`,
  "g",
);
const NUL_RE = new RegExp(String.fromCharCode(0), "g");

export const loginSchema = z
  .object({
    identifier: z
      .string()
      .max(LOGIN_BODY_IDENTIFIER_MAX, "Email muito longo.")
      .transform((s) => String(s ?? "").replace(CONTROL_CHARS_RE, "").trim().toLowerCase())
      .pipe(z.string().min(1, "Email é obrigatório.")),
    password: z
      .string()
      .max(LOGIN_BODY_PASSWORD_MAX, "Senha muito longa.")
      .transform((s) => String(s ?? "").replace(NUL_RE, ""))
      .pipe(z.string().min(1, "Senha é obrigatória")),
    twoFactorToken: z.string().trim().max(32).optional(),
    twoFactorChallengeToken: z.string().trim().max(512).optional(),
    cfTurnstileToken: z.string().trim().max(4096).optional(),
  })
  .strict();
