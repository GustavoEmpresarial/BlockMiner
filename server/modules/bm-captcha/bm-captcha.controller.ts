import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as bmCaptcha from "./bm-captcha.service.js";

const log = logger.child("bm-captcha.controller");

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
    log.error("bm_captcha.challenge_failed", { error: String(err) });
    res.status(500).json({ ok: false, code: "INTERNAL" });
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
    log.error("bm_captcha.verify_failed", { error: String(err) });
    res.status(500).json({ ok: false, code: "INTERNAL" });
  }
}
