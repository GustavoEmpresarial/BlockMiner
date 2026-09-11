import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import {
  assertFeatureTurnstile,
  featureTurnstileDenyBody,
} from "../../shared/security/featureTurnstileGate.js";
import * as shortlinksService from "./shortlinks.service.js";
import { TOTAL_STEPS } from "./shortlinks.types.js";
import { SHORTLINK_ERROR } from "./shortlinks.errors.js";

const log = logger.child("shortlinks.controller");

function clientIp(req: Request): string | undefined {
  return typeof req.ip === "string" ? req.ip : undefined;
}

function bodyToken(req: Request): unknown {
  const body = req.body as { cfTurnstileToken?: unknown } | undefined;
  return body?.cfTurnstileToken;
}

export async function getShortlinkStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const result = await shortlinksService.getStatusForUser(user.id);
    if (!result) {
      res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    log.error("getShortlinkStatus failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function startShortlink(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const gate = await assertFeatureTurnstile("shortlink", user.id, bodyToken(req), clientIp(req));
    if (!gate.ok) {
      res.status(400).json(featureTurnstileDenyBody(gate.code));
      return;
    }
    const outcome = await shortlinksService.startForUser(user.id);
    if (!outcome.ok) {
      if (outcome.reason === "daily_limit") {
        res.status(403).json({
          ok: false,
          message: "Limite diário alcançado. Volte amanhã.",
          code: SHORTLINK_ERROR.DAILY_LIMIT,
        });
        return;
      }
      res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
      return;
    }
    res.json({ ok: true, nextStep: outcome.nextStep, sessionToken: outcome.sessionToken });
  } catch (error) {
    log.error("startShortlink failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function startPasteadShortlink(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const gate = await assertFeatureTurnstile("shortlink", user.id, bodyToken(req), clientIp(req));
    if (!gate.ok) {
      res.status(400).json(featureTurnstileDenyBody(gate.code));
      return;
    }
    const outcome = await shortlinksService.startPasteadForUser(user.id);
    if (!outcome.ok) {
      if (outcome.reason === "daily_limit") {
        res.status(403).json({
          ok: false,
          message: "Limite diário de 1000 H/s no PasteAd atingido.",
          code: SHORTLINK_ERROR.DAILY_LIMIT,
        });
        return;
      }
      if (outcome.reason === "disabled") {
        res.status(503).json({
          ok: false,
          message: "PasteAd shortlink indisponível.",
          code: SHORTLINK_ERROR.DISABLED,
        });
        return;
      }
      if (outcome.reason === "api_error") {
        res.status(502).json({
          ok: false,
          message: "ZerAds demorou para responder. Aguarde 5 segundos e clique de novo.",
          code: SHORTLINK_ERROR.ZERADS_API,
        });
        return;
      }
      res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
      return;
    }
    res.json({ ok: true, token: outcome.token, externalUrl: outcome.externalUrl });
  } catch (error) {
    log.error("startPasteadShortlink failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function markPasteadDone(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const outcome = await shortlinksService.markPasteadDoneForUser(user.id, token);
    if (!outcome.ok) {
      if (outcome.reason === "no_session") {
        res.status(400).json({
          ok: false,
          message: "Sessão ZerAds inválida. Abra o link de novo e complete o captcha.",
          code: SHORTLINK_ERROR.NO_SESSION,
        });
        return;
      }
      if (outcome.reason === "expired") {
        res.status(400).json({
          ok: false,
          message: "Sessão expirada. Inicie o link novamente.",
          code: SHORTLINK_ERROR.EXPIRED,
        });
        return;
      }
      res.status(503).json({
        ok: false,
        message: "PasteAd shortlink indisponível.",
        code: SHORTLINK_ERROR.DISABLED,
      });
      return;
    }
    res.json({ ok: true, token: outcome.token, claimReadyAt: outcome.claimReadyAt });
  } catch (error) {
    log.error("markPasteadDone failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function claimPasteadShortlink(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const outcome = await shortlinksService.claimPasteadForUser(user.id, token, {
      ip: req.ip || null,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    });
    if (!outcome.ok) {
      if (outcome.reason === "no_session") {
        res.status(400).json({
          ok: false,
          message: "Nenhuma sessão ZerAds ativa. Clique em «Abrir Link ZerAds» e complete o captcha.",
          code: SHORTLINK_ERROR.NO_SESSION,
        });
        return;
      }
      if (outcome.reason === "not_completed") {
        res.status(403).json({
          ok: false,
          message: "Complete o shortlink ZerAds (anúncios + captcha) antes de resgatar.",
          code: SHORTLINK_ERROR.NOT_COMPLETED,
        });
        return;
      }
      if (outcome.reason === "too_fast") {
        res.status(429).json({
          ok: false,
          message: "Quase lá — aguarde alguns segundos e o resgate será liberado automaticamente.",
          code: SHORTLINK_ERROR.TOO_FAST,
        });
        return;
      }
      if (outcome.reason === "expired") {
        res.status(400).json({
          ok: false,
          message: "Sessão expirada. Inicie o link novamente.",
          code: SHORTLINK_ERROR.EXPIRED,
        });
        return;
      }
      if (outcome.reason === "daily_limit") {
        res.status(403).json({
          ok: false,
          message: "Limite diário de 1000 H/s atingido.",
          code: SHORTLINK_ERROR.DAILY_LIMIT,
        });
        return;
      }
      res.status(503).json({
        ok: false,
        message: "PasteAd shortlink indisponível.",
        code: SHORTLINK_ERROR.DISABLED,
      });
      return;
    }
    try {
      await syncUserBaseHashRate(user.id);
    } catch (syncErr) {
      log.warn("pastead shortlink hashrate sync failed", { error: String(syncErr) });
    }
    res.json({
      ok: true,
      reward: { message: outcome.rewardMessage, hashRate: outcome.hashRate },
    });
  } catch (error) {
    log.error("claimPasteadShortlink failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function startAdlinkflyShortlink(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const gate = await assertFeatureTurnstile("shortlink", user.id, bodyToken(req), clientIp(req));
    if (!gate.ok) {
      res.status(400).json(featureTurnstileDenyBody(gate.code));
      return;
    }
    const outcome = await shortlinksService.startAdlinkflyForUser(user.id);
    if (!outcome.ok) {
      if (outcome.reason === "daily_limit") {
        res.status(403).json({
          ok: false,
          message: "Limite diário de 1000 H/s no AdLinkFly atingido.",
          code: SHORTLINK_ERROR.DAILY_LIMIT,
        });
        return;
      }
      if (outcome.reason === "disabled") {
        res.status(503).json({
          ok: false,
          message: "AdLinkFly shortlink em manutenção.",
          code: SHORTLINK_ERROR.DISABLED,
        });
        return;
      }
      if (outcome.reason === "api_error") {
        res.status(502).json({
          ok: false,
          message: "AdLinkFly demorou para responder. Aguarde e tente de novo.",
          code: SHORTLINK_ERROR.ADLINKFLY_API,
        });
        return;
      }
      res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
      return;
    }
    res.json({ ok: true, token: outcome.token, externalUrl: outcome.externalUrl });
  } catch (error) {
    log.error("startAdlinkflyShortlink failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function markAdlinkflyDone(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const outcome = await shortlinksService.markAdlinkflyDoneForUser(user.id, token);
    if (!outcome.ok) {
      if (outcome.reason === "no_session") {
        res.status(400).json({
          ok: false,
          message: "Sessão AdLinkFly inválida. Abra o link de novo.",
          code: SHORTLINK_ERROR.NO_SESSION,
        });
        return;
      }
      if (outcome.reason === "expired") {
        res.status(400).json({
          ok: false,
          message: "Sessão expirada. Inicie o link novamente.",
          code: SHORTLINK_ERROR.EXPIRED,
        });
        return;
      }
      res.status(503).json({
        ok: false,
        message: "AdLinkFly shortlink em manutenção.",
        code: SHORTLINK_ERROR.DISABLED,
      });
      return;
    }
    res.json({ ok: true, token: outcome.token, claimReadyAt: outcome.claimReadyAt });
  } catch (error) {
    log.error("markAdlinkflyDone failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function claimAdlinkflyShortlink(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const outcome = await shortlinksService.claimAdlinkflyForUser(user.id, token, {
      ip: req.ip || null,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    });
    if (!outcome.ok) {
      if (outcome.reason === "no_session") {
        res.status(400).json({
          ok: false,
          message: "Nenhuma sessão AdLinkFly ativa.",
          code: SHORTLINK_ERROR.NO_SESSION,
        });
        return;
      }
      if (outcome.reason === "not_completed") {
        res.status(403).json({
          ok: false,
          message: "Complete o shortlink AdLinkFly antes de resgatar.",
          code: SHORTLINK_ERROR.NOT_COMPLETED,
        });
        return;
      }
      if (outcome.reason === "too_fast") {
        res.status(429).json({
          ok: false,
          message: "Quase lá — aguarde alguns segundos e o resgate será liberado automaticamente.",
          code: SHORTLINK_ERROR.TOO_FAST,
        });
        return;
      }
      if (outcome.reason === "expired") {
        res.status(400).json({
          ok: false,
          message: "Sessão expirada. Inicie o link novamente.",
          code: SHORTLINK_ERROR.EXPIRED,
        });
        return;
      }
      if (outcome.reason === "daily_limit") {
        res.status(403).json({
          ok: false,
          message: "Limite diário de 1000 H/s atingido.",
          code: SHORTLINK_ERROR.DAILY_LIMIT,
        });
        return;
      }
      res.status(503).json({
        ok: false,
        message: "AdLinkFly shortlink em manutenção.",
        code: SHORTLINK_ERROR.DISABLED,
      });
      return;
    }
    try {
      await syncUserBaseHashRate(user.id);
    } catch (syncErr) {
      log.warn("adlinkfly shortlink hashrate sync failed", { error: String(syncErr) });
    }
    res.json({
      ok: true,
      reward: { message: outcome.rewardMessage, hashRate: outcome.hashRate },
    });
  } catch (error) {
    log.error("claimAdlinkflyShortlink failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Server error", code: SHORTLINK_ERROR.INTERNAL });
  }
}

export async function completeShortlinkStep(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const body = req.body as {
      step?: unknown;
      sessionToken?: unknown;
      securityFlags?: unknown;
    };
    const { step, sessionToken, securityFlags } = body;
    const normalizedStep = Number(step);
    if (!Number.isInteger(normalizedStep) || normalizedStep < 1 || normalizedStep > TOTAL_STEPS) {
      res.status(400).json({ ok: false, message: "Invalid step", code: SHORTLINK_ERROR.INVALID_STEP });
      return;
    }
    const outcome = await shortlinksService.completeStepForUser(
      user.id,
      normalizedStep,
      sessionToken,
      securityFlags,
      {
        ip: req.ip || null,
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      },
    );
    if (!outcome.ok) {
      if (outcome.reason === "no_session") {
        res.status(400).json({ ok: false, message: "No session", code: SHORTLINK_ERROR.NO_SESSION });
        return;
      }
      if (outcome.reason === "daily_limit") {
        res.status(403).json({
          ok: false,
          message: "Limite diário alcançado.",
          code: SHORTLINK_ERROR.DAILY_LIMIT,
        });
        return;
      }
      res.status(403).json({
        ok: false,
        message: "Detection: " + outcome.incidents.join(", "),
        code: SHORTLINK_ERROR.DETECTED,
        kick: true,
      });
      return;
    }
    if (outcome.runCompleted) {
      try {
        await syncUserBaseHashRate(user.id);
      } catch (syncErr) {
        log.warn("shortlink hashrate sync failed", { error: String(syncErr) });
      }
    }
    res.json({
      ok: true,
      step: outcome.step,
      runCompleted: outcome.runCompleted,
      sessionToken: outcome.sessionToken,
      reward: outcome.rewardMessage ? { message: outcome.rewardMessage } : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Process failed";
    log.error("completeShortlinkStep failed", { error: msg });
    res.status(500).json({ ok: false, message: msg || "Process failed", code: SHORTLINK_ERROR.INTERNAL });
  }
}
