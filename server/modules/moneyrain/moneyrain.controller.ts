/**
 * Ported from dist moneyrain.controller.js + captcha pass gate on /link.
 */
import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { consumeOfferwallPass, extractPassToken } from "../bm-captcha/index.js";
import * as moneyrainService from "./moneyrain.service.js";

const log = logger.child("moneyrain.controller");

type AuthedRequest = Request & { user?: { id: number } };

export async function moneyRainCallback(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signatureHeader = String(req.headers["x-moneyrain-signature"] ?? "");
  const timestampHeader = String(req.headers["x-moneyrain-timestamp"] ?? "");
  const clientIp = String(req.headers["cf-connecting-ip"] ?? req.ip ?? "").replace("::ffff:", "");
  try {
    const result = await moneyrainService.processMoneyRainCallback(
      rawBody,
      signatureHeader,
      timestampHeader,
      clientIp,
    );
    res.status(result.status).send(result.body);
  } catch (error: unknown) {
    log.error("moneyRainCallback failed", { error: String(error) });
    res.status(500).send("internal error");
  }
}

/** GET /api/moneyrain/link — requires BM captcha pass (external offerwall). */
export async function getMoneyRainLink(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ ok: false, reason: "unauthenticated" });
    return;
  }
  const pass = await consumeOfferwallPass({
    userId,
    provider: "moneyrain",
    passToken: extractPassToken(req as never),
  });
  if (!pass.ok) {
    res.status(pass.status).json({ ok: false, reason: pass.code, code: pass.code });
    return;
  }
  const result = moneyrainService.getMoneyRainLinkForUser(userId);
  if (!result.ok) {
    res.status(result.status).json({ ok: false, reason: result.reason });
    return;
  }
  res.json({ ok: true, url: result.url });
}

export async function getMoneyRainHistory(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ ok: false });
    return;
  }
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const payload = await moneyrainService.getHistoryForUser(userId, page);
    res.json(payload);
  } catch (error: unknown) {
    log.error("getMoneyRainHistory failed", { error: String(error) });
    res.status(500).json({ ok: false });
  }
}

export async function getMoneyRainStats(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ ok: false });
    return;
  }
  try {
    const payload = await moneyrainService.getStatsForUser(userId);
    res.json(payload);
  } catch (error: unknown) {
    log.error("getMoneyRainStats failed", { error: String(error) });
    res.status(500).json({ ok: false });
  }
}
