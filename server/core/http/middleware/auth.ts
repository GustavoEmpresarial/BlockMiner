import type { NextFunction, Request, Response } from "express";
import { getAuthUserById, checkBanOrExpire, bannedResponseBody } from "../../../shared/security/authUser.js";
import { verifyAccessToken } from "../../../shared/security/authTokens.js";
import { getTokenFromRequest } from "../../../shared/security/token.js";
import { appendSetCookie, clearAuthCookies } from "../../../shared/security/cookies.js";
import { logger } from "../../logger/index.js";
import { logSecurityEvent } from "../../../shared/security/securityLogger.js";
import { authDebug } from "../../../shared/security/authDebug.js";
import {
  buildPrismaAwareErrorBody,
  isPrismaConnectionError,
  prismaAwareHttpStatus,
  unknownErrorMessage,
} from "../../../shared/errors/prismaHttpErrors.js";
import prisma from "../../database/prisma.js";
import { AUTH_LOGIN_MESSAGES, buildAuthFailureJson } from "../../../modules/auth/auth.errors.js";
import { evictIfAnonymousNetwork, loginClientIp } from "../../../modules/auth/login/login.anonymous-ip.js";

const log = logger.child("AuthMiddleware");

async function denyAnonymousSession(req: Request, res: Response, userId: number): Promise<boolean> {
  const ip = loginClientIp(req);
  const verdict = await evictIfAnonymousNetwork(prisma, userId, ip);
  if (!verdict.blocked) return false;
  authDebug("AUTH_REJECT", req, { reason: "VPN_PROXY_BLOCKED", userId, ip, intel: verdict.reason });
  logSecurityEvent("AUTHZ_VPN_PROXY_KICKED", { userId, reason: verdict.reason, ip }, req);
  appendSetCookie(res, clearAuthCookies());
  res.status(401).json(buildAuthFailureJson("VPN_PROXY_BLOCKED", AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED, {
    reason: verdict.reason,
  }));
  return true;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      authDebug("AUTH_REJECT", req, { reason: "ACCESS_COOKIE_MISSING" });
      res.status(401).json({ ok: false, message: "Session invalid.", code: "ACCESS_MISSING" });
      return;
    }
    let payload: ReturnType<typeof verifyAccessToken> | null = null;
    try {
      payload = verifyAccessToken(token);
    } catch {
      payload = null;
    }
    const userId = Number((payload && typeof payload !== "string" && payload.sub) || NaN);
    if (!userId) {
      authDebug("AUTH_REJECT", req, { reason: "ACCESS_JWT_INVALID_OR_EXPIRED" });
      res.status(401).json({ ok: false, message: "Session invalid.", code: "ACCESS_INVALID" });
      return;
    }
    const user = await getAuthUserById(userId);
    if (!user) {
      logSecurityEvent("AUTHZ_USER_NOT_FOUND", { userId }, req);
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }
    const tokenSessionVersion = payload && typeof payload !== "string" ? (payload as { sv?: number }).sv : undefined;
    if (tokenSessionVersion !== undefined && tokenSessionVersion !== user.sessionVersion) {
      authDebug("AUTH_REJECT", req, { reason: "SESSION_SUPERSEDED", userId });
      logSecurityEvent("AUTHZ_SESSION_SUPERSEDED", { userId }, req);
      res.status(401).json({
        ok: false,
        message: "Sessão encerrada — login detectado em outro dispositivo.",
        code: "SESSION_SUPERSEDED",
      });
      return;
    }
    if (user.isBanned) {
      const ban = await checkBanOrExpire(user.id);
      if (ban.banned) {
        logSecurityEvent("AUTHZ_BANNED_USER", { userId: user.id }, req);
        res.status(403).json(bannedResponseBody(ban));
        return;
      }
    }
    if (await denyAnonymousSession(req, res, user.id)) return;
    req.user = user;
    next();
  } catch (error) {
    log.error("Auth middleware error", { error: unknownErrorMessage(error) });
    if (isPrismaConnectionError(error)) {
      const fallback = "Serviço temporariamente indisponível. Tente novamente em instantes.";
      res.status(prismaAwareHttpStatus(error)).json(buildPrismaAwareErrorBody(error, fallback));
      return;
    }
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Unable to authenticate." });
  }
}

export const authenticateToken = requireAuth;

export async function authenticateTokenOptional(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      req.user = null;
      next();
      return;
    }
    let payload: ReturnType<typeof verifyAccessToken> | null = null;
    try {
      payload = verifyAccessToken(token);
    } catch {
      req.user = null;
      next();
      return;
    }
    const userId = Number((payload && typeof payload !== "string" && payload.sub) || NaN);
    if (!userId) {
      req.user = null;
      next();
      return;
    }
    const user = await getAuthUserById(userId);
    if (!user) {
      req.user = null;
      next();
      return;
    }
    if (user.isBanned && (await checkBanOrExpire(user.id)).banned) {
      req.user = null;
      next();
      return;
    }
    const tokenSessionVersion = payload && typeof payload !== "string" ? (payload as { sv?: number }).sv : undefined;
    if (tokenSessionVersion !== undefined && tokenSessionVersion !== user.sessionVersion) {
      req.user = null;
      next();
      return;
    }
    const verdict = await evictIfAnonymousNetwork(prisma, user.id, loginClientIp(req));
    if (verdict.blocked) {
      req.user = null;
      next();
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    log.error("Optional auth middleware error", { error: unknownErrorMessage(error) });
    req.user = null;
    next();
  }
}
