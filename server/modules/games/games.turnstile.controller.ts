/**
 * HTTP status + one-shot pass for mini-game Turnstile every-N gate.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { getGameTurnstileStatus, submitGameTurnstilePass } from "./games.turnstile-gate.js";

const log = logger.child("games.turnstile.controller");

const passBodySchema = z
  .object({
    cfTurnstileToken: z.string().trim().min(1).max(4096),
  })
  .strict();

export async function getTurnstileStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const status = await getGameTurnstileStatus(prisma, user.id);
    res.json({ ok: true, ...status });
  } catch (e) {
    log.error("getTurnstileStatus failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postTurnstilePass(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsed = passBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "CAPTCHA_REQUIRED" });
      return;
    }
    const result = await submitGameTurnstilePass(
      user.id,
      parsed.data.cfTurnstileToken,
      typeof req.ip === "string" ? req.ip : undefined,
    );
    if (!result.ok) {
      res.status(400).json({ ok: false, code: result.code });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    log.error("postTurnstilePass failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}
