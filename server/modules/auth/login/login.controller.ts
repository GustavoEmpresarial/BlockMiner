/**
 * POST /auth/login. Faithful port of legacy login.controller.ts core flow:
 * username-not-supported guard, timing-safe dummy compare, password check,
 * ban check, optional email 2FA, JWT + refresh issuance, CSRF cookie reuse.
 *
 * Account lockout by IP/device (login.lockout.ts) is wired in.
 * Anonymous networks (VPN / proxy / Tor / relay / Cloudflare WARP) are
 * rejected after a valid password and before 2FA / session issuance.
 */
import type { Request, Response } from "express";
import prisma from "../../../core/database/prisma.js";
import { logger } from "../../../core/logger/index.js";
import { checkBanOrExpire, bannedResponseBody } from "../../../shared/security/authUser.js";
import { isSmtpConfigured } from "../../../shared/security/mailer.js";
import { unknownErrorMessage, respondAuthPrismaError } from "../../../shared/errors/prismaHttpErrors.js";
import { AUTH_LOGIN_MESSAGES, buildAuthFailureJson } from "../auth.errors.js";
import { findUserByIdentifier } from "../auth.repository.js";
import { comparePassword, compareDummyPassword } from "../auth.service.js";
import { issueAuthSessionForUser } from "../auth.sessionIssue.js";
import { getAuthTwoFactorEnvConfig, shouldRequireEmailTwoFactorForLogin } from "./login.twoFactor.js";
import { issueEmailTwoFactorChallenge, verifyEmailTwoFactorChallenge } from "./login.twoFactorChallenge.js";
import { getAuthLockStatus, recordAuthLoginFailure } from "./login.lockout.js";
import { authLoginTrace, buildAuthRequestContext } from "../../../shared/security/authDebug.js";
import { inspectAnonymousLoginIp, loginClientIp } from "./login.anonymous-ip.js";

const log = logger.child("LoginController");

function loginSecurity(event: string, req: Request, details: Record<string, unknown>, identifier?: unknown) {
  log.security(event, { ...buildAuthRequestContext(req), ...details }, req);
  authLoginTrace(event, req, details, identifier);
}

export async function loginPost(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password, twoFactorToken, twoFactorChallengeToken } = req.body;
    const clientIp = loginClientIp(req);
    const body = req.body;
    authLoginTrace("AUTH_LOGIN_ATTEMPT", req, {
      hasPassword: Boolean(String(password ?? "").length),
      hasTwoFactorToken: Boolean(String(twoFactorToken ?? "").trim()),
      hasTwoFactorChallenge: Boolean(String(twoFactorChallengeToken ?? "").trim()),
      hasTurnstileToken: Boolean(String(body?.cfTurnstileToken ?? "").trim()),
    }, identifier);
    const ipLock = await getAuthLockStatus({ ip: clientIp, userId: null });
    if (ipLock.locked) {
      loginSecurity("AUTH_LOCKOUT_DENIED", req, { reason: "ip", lockedUntil: ipLock.until }, identifier);
      res.status(403).json(buildAuthFailureJson("ACCOUNT_LOCKED", AUTH_LOGIN_MESSAGES.ACCOUNT_LOCKED, { lockedUntil: ipLock.until }));
      return;
    }
    const identifierStr = String(identifier ?? "");
    if (!identifierStr.includes("@")) {
      await compareDummyPassword(String(password ?? ""));
      await recordAuthLoginFailure({ ip: clientIp, userId: null });
      loginSecurity("AUTH_LOGIN_FAILURE", req, { reason: "USERNAME_NOT_SUPPORTED", httpStatus: 400 }, identifier);
      res.status(400).json(buildAuthFailureJson("USERNAME_NOT_SUPPORTED", AUTH_LOGIN_MESSAGES.USERNAME_NOT_SUPPORTED));
      return;
    }
    const user = await findUserByIdentifier(identifier);
    if (!user) {
      await compareDummyPassword(String(password ?? ""));
      await recordAuthLoginFailure({ ip: clientIp, userId: null });
      loginSecurity("AUTH_LOGIN_FAILURE", req, { reason: "IDENTIFIER_NOT_FOUND", httpStatus: 401 }, identifier);
      res.status(401).json(buildAuthFailureJson("INVALID_CREDENTIALS", AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS));
      return;
    }
    const combinedLock = await getAuthLockStatus({ ip: clientIp, userId: user.id });
    if (combinedLock.locked) {
      loginSecurity("AUTH_LOCKOUT_DENIED", req, { reason: "user_or_ip", userId: user.id, lockedUntil: combinedLock.until }, identifier);
      res.status(403).json(buildAuthFailureJson("ACCOUNT_LOCKED", AUTH_LOGIN_MESSAGES.ACCOUNT_LOCKED, { lockedUntil: combinedLock.until }));
      return;
    }
    const isPasswordMatch = await comparePassword(String(password ?? ""), user.passwordHash);
    if (!isPasswordMatch) {
      await recordAuthLoginFailure({ ip: clientIp, userId: user.id });
      loginSecurity("AUTH_LOGIN_FAILURE", req, { reason: "INVALID_CREDENTIALS", userId: user.id, httpStatus: 401 }, identifier);
      res.status(401).json(buildAuthFailureJson("INVALID_CREDENTIALS", AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS));
      return;
    }
    if (user.isBanned) {
      const ban = await checkBanOrExpire(user.id);
      if (ban.banned) {
        res.status(403).json({ ...buildAuthFailureJson("ACCOUNT_DISABLED", AUTH_LOGIN_MESSAGES.ACCOUNT_DISABLED), ...bannedResponseBody(ban) });
        return;
      }
    }
    const anonymous = await inspectAnonymousLoginIp(prisma, clientIp);
    if (anonymous.blocked) {
      loginSecurity("AUTH_VPN_PROXY_DENIED", req, {
        userId: user.id,
        reason: anonymous.reason,
        proxySource: anonymous.proxySource,
        asn: anonymous.asn,
        proxyDetected: anonymous.proxyDetected,
        httpStatus: 403,
      }, identifier);
      res.status(403).json(buildAuthFailureJson("VPN_PROXY_BLOCKED", AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED, {
        reason: anonymous.reason,
      }));
      return;
    }
    const tfEnv = getAuthTwoFactorEnvConfig();
    const requireEmail2fa = shouldRequireEmailTwoFactorForLogin({ user, env: tfEnv });
    if (requireEmail2fa) {
      const tfToken = typeof twoFactorToken === "string" ? twoFactorToken.trim() : "";
      const tfChallenge = typeof twoFactorChallengeToken === "string" ? twoFactorChallengeToken.trim() : "";
      if (tfToken && !tfChallenge) {
        res.status(400).json(buildAuthFailureJson("TWO_FACTOR_CHALLENGE_REQUIRED", AUTH_LOGIN_MESSAGES.TWO_FACTOR_CHALLENGE_REQUIRED));
        return;
      }
      if (!tfToken && tfChallenge) {
        res.status(400).json(buildAuthFailureJson("TWO_FACTOR_CODE_REQUIRED", AUTH_LOGIN_MESSAGES.TWO_FACTOR_CODE_REQUIRED));
        return;
      }
      if (!tfToken && !tfChallenge) {
        if (!isSmtpConfigured()) {
          res.status(503).json(buildAuthFailureJson("EMAIL_2FA_UNAVAILABLE", AUTH_LOGIN_MESSAGES.EMAIL_2FA_UNAVAILABLE));
          return;
        }
        const challenge = await issueEmailTwoFactorChallenge({ userId: user.id, email: user.email, name: user.name });
        loginSecurity("AUTH_LOGIN_2FA_REQUIRED", req, { userId: user.id }, identifier);
        res.status(200).json({
          ok: false,
          code: "TWO_FACTOR_REQUIRED",
          require2FA: true,
          twoFactorMethod: "email",
          twoFactorChallengeToken: challenge.challengeToken,
          twoFactorTtlMinutes: challenge.ttlMinutes,
          message: AUTH_LOGIN_MESSAGES.REQUIRE_2FA_EMAIL,
          error: AUTH_LOGIN_MESSAGES.REQUIRE_2FA_EMAIL,
        });
        return;
      }
      const twoFactorResult = verifyEmailTwoFactorChallenge({ challengeToken: tfChallenge, code: tfToken, userId: user.id });
      if (!twoFactorResult.ok) {
        if (twoFactorResult.reason !== "EXPIRED") {
          await recordAuthLoginFailure({ ip: clientIp, userId: user.id });
        }
        loginSecurity("AUTH_LOGIN_FAILURE", req, { reason: "INVALID_2FA", userId: user.id, twoFactorReason: twoFactorResult.reason, httpStatus: 401 }, identifier);
        const failMsg = twoFactorResult.reason === "EXPIRED" ? AUTH_LOGIN_MESSAGES.TWO_FACTOR_EXPIRED : AUTH_LOGIN_MESSAGES.INVALID_2FA;
        const failCode = twoFactorResult.reason === "EXPIRED" ? "TWO_FACTOR_EXPIRED" : "INVALID_TWO_FACTOR_CODE";
        res.status(401).json(buildAuthFailureJson(failCode, failMsg));
        return;
      }
    }
    // Consolidated (2026-09-11) onto the same session-issuance path already used, unmodified,
    // by the Google/SatsPay OAuth controllers — was hand-rolled here identically (user update
    // + revoke + cache invalidate + sign + cookies + recordAuthLoginSuccess), see
    // auth.sessionIssue.ts. Behavior-preserving: verified by
    // tests/auth/session-issuance.characterization.test.mjs before/after this change.
    const session = await issueAuthSessionForUser({ req, res, user });
    loginSecurity("AUTH_LOGIN_SUCCESS", req, { userId: user.id, httpStatus: 200 }, identifier);
    res.json({ ok: true, user: session.user });
  } catch (error) {
    if (respondAuthPrismaError(res, error, AUTH_LOGIN_MESSAGES.SERVICE_UNAVAILABLE)) return;
    log.error("auth.login.unexpected", { message: unknownErrorMessage(error) });
    res.status(500).json(buildAuthFailureJson("INTERNAL_ERROR", AUTH_LOGIN_MESSAGES.INTERNAL));
  }
}
