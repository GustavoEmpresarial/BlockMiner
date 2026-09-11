// @ts-nocheck — restored from dist for compile; refine later
import { z } from "zod";
import { isRegisterAllowedEmailDomain } from "./registerAllowedEmailDomains.js";
const CONTROL_CODES = [
    ...Array.from({ length: 9 }, (_, i) => i),
    0x0b,
    0x0c,
    ...Array.from({ length: 18 }, (_, i) => 0x0e + i),
    0x7f,
];
const CONTROL_CHARS_RE = new RegExp(`[${CONTROL_CODES.map((c) => String.fromCharCode(c)).join("")}]`, "g");
const NUL_RE = new RegExp(String.fromCharCode(0), "g");
function stripAsciiControls(s) {
    return String(s ?? "").replace(CONTROL_CHARS_RE, "");
}
export const REGISTER_USERNAME_MIN = 3;
export const REGISTER_USERNAME_MAX = 24;
export const REGISTER_EMAIL_MAX_LEN = 254;
export const REGISTER_PASSWORD_MIN_LEN = 8;
/** bcrypt only uses the first 72 bytes; cap avoids abuse and matches verification. */
export const REGISTER_PASSWORD_MAX_LEN = 72;
export const REGISTER_REF_CODE_MAX_LEN = 32;
/** POST /auth/register JSON body. refCode empty string becomes undefined after parse. */
export const registerBodySchema = z
    .object({
    username: z.preprocess((v) => stripAsciiControls(v).trim(), z
        .string()
        .min(REGISTER_USERNAME_MIN, "auth.register.errors.username_too_short")
        .max(REGISTER_USERNAME_MAX, "auth.register.errors.username_too_long")
        .regex(/^[a-zA-Z0-9._-]+$/, "auth.register.errors.username_invalid")),
    email: z.preprocess((v) => stripAsciiControls(v).trim().toLowerCase(), z
        .string()
        .min(1, "auth.register.errors.email_invalid")
        .max(REGISTER_EMAIL_MAX_LEN, "auth.register.errors.email_too_long")
        .email("auth.register.errors.email_invalid")
        .refine((addr) => isRegisterAllowedEmailDomain(addr), {
        message: "auth.register.errors.email_provider_not_allowed",
    })),
    password: z.preprocess((v) => String(v ?? "").replace(NUL_RE, ""), z
        .string()
        .min(REGISTER_PASSWORD_MIN_LEN, "auth.register.errors.password_min")
        .max(REGISTER_PASSWORD_MAX_LEN, "auth.register.errors.password_max")),
    refCode: z.preprocess((v) => {
        if (v === undefined || v === null)
            return "";
        return stripAsciiControls(v)
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, REGISTER_REF_CODE_MAX_LEN)
            .trim();
    }, z
        .string()
        .max(REGISTER_REF_CODE_MAX_LEN, "auth.register.errors.ref_code_too_long")
        .regex(/^$|^[a-zA-Z0-9]+$/, "auth.register.errors.ref_code_invalid")
        .transform((s) => (s === "" ? undefined : s))),
    acceptTerms: z.boolean().refine((value) => value === true, {
        message: "validation.errors.termsRequired",
    }),
    cfTurnstileToken: z.preprocess((v) => (v === undefined || v === null || v === "" ? undefined : stripAsciiControls(v).trim().slice(0, 4096)), z.string().max(4096).optional()),
    utmSource: z.string().trim().max(255).optional(),
    utmMedium: z.string().trim().max(255).optional(),
    utmCampaign: z.string().trim().max(255).optional(),
    referrerDomain: z.string().trim().max(255).optional(),
})
    .strict();
