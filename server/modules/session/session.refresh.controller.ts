import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { authDebug } from "../../shared/security/authDebug.js";
import { getRefreshTokenFromRequest, getTokenFromRequest } from "../../shared/security/token.js";
import { createRefreshToken, parseRefreshToken, signAccessToken, verifyAccessToken } from "../../shared/security/authTokens.js";
import { appendSetCookie, buildAccessCookie, buildRefreshCookie, clearAuthCookies } from "../../shared/security/cookies.js";
import { unknownErrorMessage, respondAuthPrismaError } from "../../shared/errors/prismaHttpErrors.js";
import { createRefreshTokenRecord, getRefreshTokenById, revokeRefreshToken } from "./session.tokens.js";
import { AUTH_LOGIN_MESSAGES } from "../auth/auth.errors.js";
import { evictIfAnonymousNetwork, loginClientIp } from "../auth/login/login.anonymous-ip.js";

const log = logger.child("SessionRefreshController");

const AUTH_MESSAGES = {
  SERVICE_UNAVAILABLE: "O servidor está ocupado no momento. Aguarde alguns segundos e tente entrar novamente.",
  INTERNAL: "Não foi possível concluir o login. Tente novamente.",
};

function sendUnauthenticated(res: Response, code = "UNAUTHENTICATED"): void {
  appendSetCookie(res, clearAuthCookies());
  res.status(401).json({ ok: false, code, message: "Sessão expirada ou ausente.", error: "Sessão expirada ou ausente." });
}

/** Rotate access (and refresh) JWT cookies using the HttpOnly refresh token. */
export async function refreshPost(req: Request, res: Response): Promise<void> {
  authDebug("AUTH_REFRESH_ATTEMPT", req);
  try {
    const rawRefresh = getRefreshTokenFromRequest(req);
    const parsed = parseRefreshToken(rawRefresh);
    if (!parsed) {
      sendUnauthenticated(res, "REFRESH_INVALID");
      return;
    }

    const row = await getRefreshTokenById(parsed.tokenId);
    if (!row || row.revokedAt) {
      sendUnauthenticated(res, "REFRESH_REVOKED");
      return;
    }
    if (row.tokenHash !== parsed.tokenHash) {
      sendUnauthenticated(res, "REFRESH_INVALID");
      return;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      sendUnauthenticated(res, "REFRESH_EXPIRED");
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || user.isBanned) {
      sendUnauthenticated(res, "REFRESH_INVALID");
      return;
    }

    const anonymous = await evictIfAnonymousNetwork(prisma, user.id, loginClientIp(req));
    if (anonymous.blocked) {
      authDebug("AUTH_REJECT", req, { reason: "VPN_PROXY_BLOCKED", userId: user.id, intel: anonymous.reason });
      log.security("AUTH_VPN_PROXY_REFRESH_DENIED", { userId: user.id, reason: anonymous.reason }, req);
      appendSetCookie(res, clearAuthCookies());
      res.status(401).json({
        ok: false,
        code: "VPN_PROXY_BLOCKED",
        message: AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED,
        error: AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED,
      });
      return;
    }

    const accessToken = signAccessToken(user);
    const nextRefresh = createRefreshToken();
    await revokeRefreshToken({ tokenId: parsed.tokenId, revokedAt: Date.now(), replacedBy: nextRefresh.tokenId });
    await createRefreshTokenRecord({ userId: user.id, ...nextRefresh, createdAt: Date.now() });

    appendSetCookie(res, [buildAccessCookie(accessToken), buildRefreshCookie(nextRefresh.token, nextRefresh.expiresAt)]);
    authDebug("AUTH_REFRESH_OK", req, { userId: user.id, previousAccessPresent: Boolean(getTokenFromRequest(req)) });
    res.json({ ok: true, user: { id: user.id, name: user.name, username: user.username, email: user.email } });
  } catch (error: unknown) {
    if (respondAuthPrismaError(res, error, AUTH_MESSAGES.SERVICE_UNAVAILABLE)) return;
    log.error("auth.refresh.unexpected", { message: unknownErrorMessage(error) });
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: AUTH_MESSAGES.INTERNAL, error: AUTH_MESSAGES.INTERNAL });
  }
}

/** Extend access JWT Max-Age on successful authenticated activity (sliding session). */
export function maybeRenewAccessCookie(req: Request, res: Response): void {
  const user = req.user;
  if (!user) return;
  const token = getTokenFromRequest(req);
  if (!token) return;
  const payload = verifyAccessToken(token);
  if (!payload || typeof payload === "string" || !payload.sub) return;

  const expMs = Number(payload.exp ?? 0) * 1000;
  if (!expMs) return;

  const remainingMs = expMs - Date.now();
  const renewThresholdMs = Number(process.env.ACCESS_TOKEN_RENEW_THRESHOLD_MS ?? 6 * 60 * 60 * 1000);
  if (remainingMs > renewThresholdMs) return;

  const renewed = signAccessToken(user);
  appendSetCookie(res, buildAccessCookie(renewed));
  authDebug("AUTH_ACCESS_SLIDING_RENEW", req, { userId: user.id, remainingMs });
}
