/**
 * Auth module service — merges legacy shared/auth.service.ts (password
 * hashing) + auth.security.ts (cookies/timing-safe compares) +
 * auth.password-jwt.ts (password-reset JWT) behind one module-owned surface.
 * The reusable primitives (bcrypt, JWT access/refresh, cookies) live in
 * shared/security/ because session/users/admin need them too; this file is
 * the auth module's own composition + password-reset-token concern, which
 * belongs to auth alone.
 */
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";

export { hashPassword, comparePassword, compareDummyPassword } from "../../shared/security/password.js";
export {
  buildCookie,
  buildAccessCookie,
  buildRefreshCookie,
  clearAuthCookies,
  clearAccessCookieOnly,
  timingSafeAdminSecretEqual,
} from "../../shared/security/cookies.js";
export {
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  parseRefreshToken,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS,
} from "../../shared/security/authTokens.js";

const PASSWORD_RESET_TOKEN_TTL = process.env.PASSWORD_RESET_TOKEN_TTL || "20m";
// item 95 Parte B: mesmo padrão stateless do reset de senha — JWT auto-contido, sem tabela
// nova. 24h de validade (bem mais generoso que o reset, que é uma ação imediata; verificação
// de email é algo que o usuário pode deixar pra depois).
const EMAIL_VERIFICATION_TOKEN_TTL = process.env.EMAIL_VERIFICATION_TOKEN_TTL || "24h";
const JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";
export const APP_URL = process.env.APP_URL || "https://blockminer.space";
export { PASSWORD_RESET_TOKEN_TTL, EMAIL_VERIFICATION_TOKEN_TTL };

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required.");
  return secret;
}

export function signPasswordResetToken(userId: number, passwordResetVersion: number): string {
  const payload: JwtPayload & { typ: string; prv: number } = {
    sub: String(userId),
    typ: "pwd_reset",
    prv: passwordResetVersion,
  };
  const signOptions: SignOptions = {
    expiresIn: PASSWORD_RESET_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(payload, requireJwtSecret(), signOptions);
}

export function verifyPasswordResetToken(
  token: unknown,
): (JwtPayload & { typ?: string; prv?: number }) | null {
  try {
    if (!process.env.JWT_SECRET) return null;
    const raw = jwt.verify(String(token), process.env.JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    if (typeof raw === "string") return null;
    const payload = raw as JwtPayload & { typ?: string; prv?: number };
    if (payload.typ !== "pwd_reset") return null;
    return payload;
  } catch {
    return null;
  }
}

export function signEmailVerificationToken(userId: number): string {
  const payload: JwtPayload & { typ: string } = { sub: String(userId), typ: "email_verify" };
  const signOptions: SignOptions = {
    expiresIn: EMAIL_VERIFICATION_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(payload, requireJwtSecret(), signOptions);
}

export function verifyEmailVerificationToken(token: unknown): (JwtPayload & { typ?: string }) | null {
  try {
    if (!process.env.JWT_SECRET) return null;
    const raw = jwt.verify(String(token), process.env.JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    if (typeof raw === "string") return null;
    const payload = raw as JwtPayload & { typ?: string };
    if (payload.typ !== "email_verify") return null;
    return payload;
  } catch {
    return null;
  }
}

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function prismaClientErrorFields(error: unknown): { code?: string; meta?: unknown } {
  if (typeof error !== "object" || error === null) return {};
  const rec = error as { code?: unknown; meta?: unknown };
  return { code: typeof rec.code === "string" ? rec.code : undefined, meta: rec.meta };
}
