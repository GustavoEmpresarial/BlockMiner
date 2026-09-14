/**
 * Single-active-session enforcement — shared by every place that independently verifies a
 * JWT + fetches the user (HTTP requireAuth, GET /auth/session, and each Socket.IO namespace's
 * own auth block; none of them go through a common middleware, so the check can't live in
 * just one place). A login on another device bumps User.sessionVersion (login.controller.ts)
 * and every token minted before that carries a stale `sv` claim — reject it here.
 */
import type { JwtPayload } from "jsonwebtoken";

export function readTokenSessionVersion(payload: JwtPayload | string | null): number | undefined {
  if (!payload || typeof payload === "string") return undefined;
  return (payload as JwtPayload & { sv?: number }).sv;
}

/** True when the token's embedded session version (if any) still matches the user's current one. */
export function isTokenSessionCurrent(payload: JwtPayload | string | null, userSessionVersion: number | null | undefined): boolean {
  const tokenSv = readTokenSessionVersion(payload);
  if (tokenSv === undefined) return false;
  return tokenSv === userSessionVersion;
}
