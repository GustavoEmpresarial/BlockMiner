/**
 * Offerwall.GG HTTP handlers.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { consumeOfferwallPass, extractPassToken } from "../bm-captcha/index.js";
import * as offerwallGgService from "./offerwallgg.service.js";

const log = logger.child("offerwallgg.controller");

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string") return cfIp.trim();
  return String(req.ip ?? "").replace("::ffff:", "");
}

export async function offerwallGgPostback(req: Request, res: Response): Promise<void> {
  const clientIp = getClientIp(req);
  if (!offerwallGgService.isIpAllowed(clientIp)) {
    log.warn("postback.ip_rejected", { ip: clientIp });
    res.status(403).send("ERROR: Invalid source");
    return;
  }
  log.info("postback.ip_accepted", { ip: clientIp });
  const body = (req.method === "POST" ? { ...req.query, ...req.body } : req.query) as Record<string, unknown>;
  const input = {
    userId: String(body.user ?? body.userId ?? "").trim(),
    transactionId: String(body.tx ?? body.transactionId ?? "").trim(),
    amount: String(body.amount ?? body.currencyAmount ?? "").trim(),
    payoutUsd: String(body.payout ?? body.payoutUsd ?? "0").trim(),
    offerName: String(body.offer ?? body.offerName ?? "").trim(),
    offerId: String(body.offerId ?? "").trim(),
    status: String(body.status ?? "credited").trim(),
    test: String(body.test ?? "0").trim(),
    signature: String(body.sig ?? body.signature ?? "").trim(),
  };
  try {
    const result = await offerwallGgService.processPostback(input, clientIp);
    switch (result.kind) {
      case "ok":
        res.send("ok");
        return;
      case "bad_request":
        res.status(400).send(result.message);
        return;
      case "forbidden":
        res.status(403).send(result.message);
        return;
      case "not_found":
        res.status(404).send(result.message);
        return;
      case "internal":
        res.status(500).send(result.message);
        return;
    }
  } catch (error: unknown) {
    log.error("postback.unhandled", { error: String(error) });
    res.status(500).send("ERROR: Internal");
  }
}

export async function getOfferwallGgHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const payload = await offerwallGgService.getHistoryForUser(user.id, page);
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    log.error("history failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading history." });
  }
}

export async function getOfferwallGgStats(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await offerwallGgService.getStatsForUser(user.id);
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    log.error("stats failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading stats." });
  }
}

/** GET /api/offerwallgg/embed — captcha-gated iframe URL (pass optional while BM captcha off). */
export async function getOfferwallGgEmbed(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const pass = await consumeOfferwallPass({
      userId: user.id,
      provider: "offerwallgg",
      passToken: extractPassToken(req as never),
    });
    if (!pass.ok) {
      res.status(pass.status).json({ ok: false, code: pass.code });
      return;
    }
    const url = offerwallGgService.buildEmbedUrl(user.id);
    if (!url) {
      res.status(503).json({ ok: false, code: "OFFERWALLGG_MISCONFIGURED" });
      return;
    }
    res.json({ ok: true, url });
  } catch (error: unknown) {
    log.error("embed failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading embed." });
  }
}
