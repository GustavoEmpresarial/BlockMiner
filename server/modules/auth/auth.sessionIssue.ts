/**
 * Issue BlockMiner session cookies after password or OAuth login.
 */
import crypto from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { buildCsrfCookie } from "../../core/http/middleware/csrf.js";
import { invalidateAuthUserCache } from "../../shared/security/authUser.js";
import { toAuthPublicUserDto } from "./auth.dto.js";
import {
  buildAccessCookie,
  buildRefreshCookie,
  createRefreshToken,
  signAccessToken,
} from "./auth.service.js";
import { createRefreshTokenRecord, revokeRefreshTokensForUser } from "../session/index.js";
import { recordAuthLoginSuccess } from "./login/login.lockout.js";
import { loginClientIp } from "./login/login.anonymous-ip.js";

type SessionUser = {
  id: number;
  name: string;
  username?: string | null;
  email: string;
  emailVerifiedAt?: Date | null;
  refCode?: string | null;
  sessionVersion?: number;
};

export async function issueAuthSessionForUser(args: {
  req: Request;
  res: Response;
  user: SessionUser;
}): Promise<{ user: ReturnType<typeof toAuthPublicUserDto> }> {
  const { req, res, user } = args;
  const clientIp = loginClientIp(req);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      ip: clientIp,
      lastLoginAt: new Date(),
      userAgent: req.headers["user-agent"],
      sessionVersion: { increment: 1 },
    },
  });
  await revokeRefreshTokensForUser(user.id);
  invalidateAuthUserCache(user.id);
  const accessToken = signAccessToken({ ...user, sessionVersion: updatedUser.sessionVersion });
  const refreshToken = createRefreshToken();
  await createRefreshTokenRecord({ userId: user.id, ...refreshToken, createdAt: Date.now() });
  await recordAuthLoginSuccess({ ip: clientIp, userId: user.id });
  const activeCsrf = String(res.locals.csrfToken || crypto.randomBytes(24).toString("base64url"));
  res.setHeader("Set-Cookie", [
    buildAccessCookie(accessToken),
    buildRefreshCookie(refreshToken.token, refreshToken.expiresAt),
    buildCsrfCookie(activeCsrf),
  ]);
  return { user: toAuthPublicUserDto({ ...user, emailVerifiedAt: user.emailVerifiedAt, refCode: user.refCode }) };
}
