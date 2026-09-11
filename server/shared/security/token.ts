/** Cookie names + raw-token extraction. Ported from legacy/server/utils/token.ts. */
import type { Request } from "express";

export const ACCESS_COOKIE_NAME = "blockminer_access";
export const REFRESH_COOKIE_NAME = "blockminer_refresh";
export const LEGACY_SESSION_COOKIE = "blockminer_session";
export const ADMIN_SESSION_COOKIE = "blockminer_admin_session";

function looksLikeJwt(value: unknown): boolean {
  const token = String(value || "").trim();
  if (!token) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function parseCookie(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) return {};
  return headerValue.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

export function getTokenFromRequest(req: Request): string | null {
  const cookies = parseCookie(req.headers.cookie);
  const cookieToken = cookies[ACCESS_COOKIE_NAME] || cookies[LEGACY_SESSION_COOKIE] || null;
  if (cookieToken) return cookieToken;

  const authHeader = String(req.headers.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (looksLikeJwt(bearer)) return bearer;
  }
  return null;
}

export function getRefreshTokenFromRequest(req: Request): string | null {
  const cookies = parseCookie(req.headers.cookie);
  return cookies[REFRESH_COOKIE_NAME] || null;
}

export function getAdminTokenFromRequest(req: Request): string | null {
  const cookies = parseCookie(req.headers.cookie);
  const adminCookieToken = cookies[ADMIN_SESSION_COOKIE] || null;
  if (adminCookieToken) return adminCookieToken;

  const authHeader = String(req.headers.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (looksLikeJwt(bearer)) return bearer;
  }
  return null;
}
