import type { Request, Response } from "express";
import { reportError } from "../../core/errors/index.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { classifyInfrastructureError } from "../../shared/errors/prismaHttpErrors.js";
import { BM_CAPTCHA_ERROR } from "./bm-captcha.errors.js";
import * as bmCaptcha from "./bm-captcha.service.js";

function userIdOf(req: Request): number | undefined {
  const id = req.user?.id;
  return typeof id === "number" ? id : undefined;
}

function failed(
  res: Response,
  req: Request,
  code: string,
  operation: string,
  error: unknown,
): void {
  const infra = classifyInfrastructureError(error);
  const report = reportError({
    code,
    category: infra ? "DATABASE" : "UNKNOWN",
    severity: "ERROR",
    impact: "MEDIUM",
    module: "bm-captcha",
    operation,
    error,
    context: { userId: userIdOf(req) },
    req,
  });
  res.status(500).json({ ok: false, code: "INTERNAL", errorId: report.errorId });
}

/** POST /api/bm-captcha/challenge */
export async function postChallenge(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const purpose = String(req.body?.purpose ?? "");
    const provider = String(req.body?.provider ?? "");
    const result = await bmCaptcha.mintChallenge({ userId: user.id, purpose, provider });
    if (!result.ok) {
      res.status(result.status).json({ ok: false, code: result.code });
      return;
    }
    res.json({ ok: true, challenge: result.challenge });
  } catch (err: unknown) {
    failed(res, req, BM_CAPTCHA_ERROR.CHALLENGE_FAILED, "postChallenge", err);
  }
}

/** POST /api/bm-captcha/verify */
export async function postVerify(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const result = await bmCaptcha.verifyChallenge(user.id, {
      challengeId: String(req.body?.challengeId ?? ""),
      clicks: Array.isArray(req.body?.clicks) ? req.body.clicks : [],
      powCounter: Number(req.body?.powCounter ?? 0),
    });
    if (!result.ok) {
      res.status(result.status).json({
        ok: false,
        code: result.code,
        attemptsLeft: result.attemptsLeft,
      });
      return;
    }
    res.json({ ok: true, passToken: result.passToken, expiresAt: result.expiresAt });
  } catch (err: unknown) {
    failed(res, req, BM_CAPTCHA_ERROR.VERIFY_FAILED, "postVerify", err);
  }
}
