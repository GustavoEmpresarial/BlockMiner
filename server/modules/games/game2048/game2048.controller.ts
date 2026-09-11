/**
 * game2048 HTTP controllers. Restored to src so claim can run antibot gate.
 */
import { z } from "zod";
import type { Request, Response } from "express";
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import { logger } from "../../../core/logger/index.js";
import { loadAndEvaluateGameRewardGate } from "../games.antibot-gate.js";
import { gameFinishDenyMessage } from "../games.finish-messages.js";
import { assertGameTurnstileForReward } from "../games.turnstile-gate.js";
import prisma from "../../../core/database/prisma.js";
import * as game2048Service from "./game2048.service.js";

const log = logger.child("game2048.controller");
const moveBodySchema = z
  .object({ sessionId: z.coerce.number().int().positive(), direction: z.enum(["up", "down", "left", "right"]) })
  .strict();
const sessionBodySchema = z
  .object({
    sessionId: z.coerce.number().int().positive(),
    cfTurnstileToken: z.string().trim().max(4096).optional(),
  })
  .strict();

function clientMeta(req: Request) {
  return { ip: typeof req.ip === "string" ? req.ip : null, userAgent: req.get("user-agent") || null };
}

function automationFromReq(req: Request): boolean {
  const header = String(req.headers["x-anti-bot"] || "").trim();
  if (header === "1" || header.toLowerCase() === "true") return true;
  const body = req.body as { antibot?: { webdriver?: unknown; isBot?: unknown }; webdriver?: unknown; isBot?: unknown } | undefined;
  const hints = body?.antibot ?? body;
  return hints?.webdriver === true || hints?.isBot === true;
}

export async function getStatus(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const data = await game2048Service.getGame2048Status(user.id);
    res.json(data);
  } catch (e) {
    log.error("getStatus failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postStart(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const r = await game2048Service.startGame2048Session(user.id);
    if (r.ok) {
      res.json({ ok: true, reused: r.reused, session: r.session });
      return;
    }
    res.status(r.status).json({
      ok: false,
      code: r.code,
      cooldownEndsAt: r.cooldownEndsAt,
      cooldownSecondsRemaining: r.cooldownSecondsRemaining,
    });
  } catch (e) {
    log.error("postStart failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postRestart(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const r = await game2048Service.restartGame2048Session(user.id);
    if (r.ok) {
      res.json({ ok: true, session: r.session });
      return;
    }
    res.status(r.status).json({
      ok: false,
      code: r.code,
      cooldownEndsAt: r.cooldownEndsAt,
      cooldownSecondsRemaining: r.cooldownSecondsRemaining,
    });
  } catch (e) {
    log.error("postRestart failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postMove(req: Request, res: Response) {
  try {
    const parsed = moveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY" });
      return;
    }
    const user = requireSessionUser(req, res);
    if (!user) return;
    const r = await game2048Service.applyGame2048Move(user.id, parsed.data.sessionId, parsed.data.direction);
    if (!r.ok) {
      res.status(r.status).json({ ok: false, code: r.code, ...("session" in r ? { session: r.session } : {}) });
      return;
    }
    res.json({ ok: true, moved: r.moved, session: r.session });
  } catch (e) {
    log.error("postMove failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaim(req: Request, res: Response) {
  try {
    const parsed = sessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "INVALID_BODY" });
      return;
    }
    const user = requireSessionUser(req, res);
    if (!user) return;

    const gate = await loadAndEvaluateGameRewardGate(prisma, user.id, automationFromReq(req));
    if (!gate.allowed) {
      const messageCode = gate.messageCode === "antibot_automation" ? "antibot_automation" : "antibot_blocked";
      res.status(403).json({
        ok: false,
        code: gate.messageCode === "antibot_automation" ? "ANTIBOT_AUTOMATION" : "ANTIBOT_BLOCKED",
        messageCode,
        message: gameFinishDenyMessage(messageCode),
        cooldownSecondsRemaining: gate.cooldownSeconds,
      });
      return;
    }

    const turnstile = await assertGameTurnstileForReward(
      prisma,
      user.id,
      parsed.data.cfTurnstileToken,
      typeof req.ip === "string" ? req.ip : undefined,
    );
    if (!turnstile.ok) {
      const messageCode = turnstile.code === "CAPTCHA_FAILED" ? "captcha_failed" : "captcha_required";
      res.status(400).json({
        ok: false,
        code: turnstile.code,
        messageCode,
        message: gameFinishDenyMessage(messageCode),
        captchaRequired: true,
      });
      return;
    }

    const r = await game2048Service.claimGame2048Reward(user.id, parsed.data.sessionId, clientMeta(req));
    if (!r.ok) {
      res.status(r.status).json({
        ok: false,
        code: r.code,
        ...("cooldownEndsAt" in r ? { cooldownEndsAt: r.cooldownEndsAt, cooldownSecondsRemaining: r.cooldownSecondsRemaining } : {}),
      });
      return;
    }
    res.json({
      ok: true,
      idempotent: r.idempotent,
      rewardHashRate: r.rewardHashRate,
      powerDays: r.powerDays,
      rewardPowerDays: r.rewardPowerDays,
      rewardPowerHours: r.rewardPowerHours,
      nextClaimAllowedAt: r.nextClaimAllowedAt,
      cooldownSecondsRemaining: r.cooldownSecondsRemaining,
    });
  } catch (e) {
    log.error("postClaim failed", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}
