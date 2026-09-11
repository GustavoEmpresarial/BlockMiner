/**
 * GET /auth/session, POST /auth/logout, POST /auth/mark-adblock.
 * Ported from legacy/server/modules/auth/session/session.controller.ts
 * (merged into this top-level session module per plan decision).
 *
 * Deviation: `energyHasPendingTax` (energy-tax module, not yet built) is
 * always reported `false` here — wire it back once `modules/energy-tax` exists.
 */
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { authDebug } from "../../shared/security/authDebug.js";
import { getRefreshTokenFromRequest, getTokenFromRequest } from "../../shared/security/token.js";
import { verifyAccessToken } from "../../shared/security/authTokens.js";
import { appendSetCookie, clearAuthCookies, clearAccessCookieOnly } from "../../shared/security/cookies.js";
import { unknownErrorMessage, respondAuthPrismaError } from "../../shared/errors/prismaHttpErrors.js";
import { maybeRenewAccessCookie } from "./session.refresh.controller.js";
import { AUTH_LOGIN_MESSAGES } from "../auth/auth.errors.js";
import { evictIfAnonymousNetwork, loginClientIp } from "../auth/login/login.anonymous-ip.js";

const log = logger.child("SessionAuthController");

function sendUnauthenticated(
  res: Response,
  code = "UNAUTHENTICATED",
  clearRefresh = false,
  message = "Sessão expirada ou ausente.",
): void {
  appendSetCookie(res, clearRefresh ? clearAuthCookies() : clearAccessCookieOnly());
  const csrfToken = typeof res.locals.csrfToken === "string" ? res.locals.csrfToken : undefined;
  res.status(401).json({
    ok: false,
    code,
    message,
    error: message,
    ...(csrfToken ? { csrfToken } : {}),
  });
}

export async function getSession(req: Request, res: Response): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      const hasRefresh = Boolean(getRefreshTokenFromRequest(req));
      sendUnauthenticated(res, hasRefresh ? "ACCESS_MISSING" : "UNAUTHENTICATED", !hasRefresh);
      return;
    }

    const payload = verifyAccessToken(token);
    if (!payload || typeof payload === "string" || !payload.sub) {
      const hasRefresh = Boolean(getRefreshTokenFromRequest(req));
      sendUnauthenticated(res, hasRefresh ? "ACCESS_INVALID" : "UNAUTHENTICATED", !hasRefresh);
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user || user.isBanned) {
      sendUnauthenticated(res, "UNAUTHENTICATED", true);
      return;
    }

    // Single-active-session enforcement — same check as requireAuth (core/http/middleware/
    // auth.ts). This endpoint has its own JWT-verify + user-fetch path (does not go through
    // requireAuth), so the check must be duplicated here or a login elsewhere would never
    // actually kick this device out of GET /auth/session (the poll every page relies on).
    const tokenSessionVersion = (payload as { sv?: number }).sv;
    if (tokenSessionVersion !== undefined && tokenSessionVersion !== user.sessionVersion) {
      authDebug("AUTH_REJECT", req, { reason: "SESSION_SUPERSEDED", userId: user.id });
      sendUnauthenticated(res, "SESSION_SUPERSEDED", true);
      return;
    }

    const anonymous = await evictIfAnonymousNetwork(prisma, user.id, loginClientIp(req));
    if (anonymous.blocked) {
      authDebug("AUTH_REJECT", req, { reason: "VPN_PROXY_BLOCKED", userId: user.id, intel: anonymous.reason });
      log.security("AUTH_VPN_PROXY_SESSION_KICKED", { userId: user.id, reason: anonymous.reason }, req);
      sendUnauthenticated(res, "VPN_PROXY_BLOCKED", true, AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED);
      return;
    }

    const hasReferral = Boolean(await prisma.referral.findUnique({ where: { referredId: user.id } }));

    req.user = user;
    maybeRenewAccessCookie(req, res);
    authDebug("AUTH_SESSION_OK", req, { userId: user.id });
    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        hasReferral,
        energyHasPendingTax: false,
        // item 95 Parte B — usuários antigos foram backfillados (emailVerifiedAt = createdAt).
        emailVerified: user.emailVerifiedAt != null,
        // item 97 — público por design, usado pelo frontend pra montar o link de indicação.
        refCode: user.refCode,
      },
    });
  } catch (error: unknown) {
    if (respondAuthPrismaError(res, error, "O servidor está ocupado no momento. Tente novamente.")) return;
    log.error("auth.session.unexpected", { message: unknownErrorMessage(error) });
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "Não foi possível processar a autenticação agora." });
  }
}

export async function logoutPost(req: Request, res: Response): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    let userId: number | null = null;
    if (token) {
      const payload = verifyAccessToken(token);
      if (payload && typeof payload !== "string" && payload.sub) userId = Number(payload.sub);
    }
    log.security("AUTH_LOGOUT", { userId }, req);
  } catch {
    // Never block logout on logging failure.
  }
  appendSetCookie(res, clearAuthCookies());
  res.json({ ok: true });
}

export async function markAdblockPost(req: Request, res: Response): Promise<void> {
  try {
    await prisma.user.update({ where: { id: req.user!.id }, data: { hasAdblock: true } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
}
