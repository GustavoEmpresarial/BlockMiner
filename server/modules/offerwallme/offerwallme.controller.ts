/**
 * Ported from dist offerwallme.controller.js + captcha-gated embed URL.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { consumeOfferwallPass, extractPassToken } from "../bm-captcha/index.js";
import * as offerwallmeService from "./offerwallme.service.js";

const log = logger.child("offerwallme.controller");

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string") return cfIp.trim();
  return String(req.ip ?? "").replace("::ffff:", "");
}

/** Offerwall.me publisher wall id — env override. */
export function offerwallMePublisherId(): string {
  return String(process.env.OFFERWALLME_PUBLISHER_ID || "yyu8i3jt58by9do1fbdr0fyn60yn5u").trim();
}

export async function offerwallMePostback(req: Request, res: Response): Promise<void> {
  const clientIp = getClientIp(req);
  if (!offerwallmeService.isIpAllowed(clientIp)) {
    log.warn("postback.ip_rejected", { ip: clientIp });
    res.status(403).send("ERROR: Invalid source");
    return;
  }
  log.info("postback.ip_accepted", { ip: clientIp });
  const body = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
  const input = {
    subId: String(body.subId ?? "").trim(),
    transId: String(body.transId ?? "").trim(),
    reward: String(body.reward ?? "").trim(),
    payout: String(body.payout ?? "0").trim(),
    offerName: String(body.offer_name ?? "").trim(),
    offerType: String(body.offer_type ?? "").trim(),
    status: parseInt(String(body.status ?? "1"), 10),
    debug: String(body.debug ?? "0").trim(),
    signature: String(body.signature ?? "").trim(),
  };
  try {
    const result = await offerwallmeService.processPostback(input, clientIp);
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

export async function getOfferwallMeHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const payload = await offerwallmeService.getHistoryForUser(user.id, page);
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    log.error("history failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading history." });
  }
}

export async function getOfferwallMeStats(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await offerwallmeService.getStatsForUser(user.id);
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    log.error("stats failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading stats." });
  }
}

/**
 * GET /api/offerwallme/embed — captcha-gated iframe URL.
 * Client must not hardcode the publisher wall without a pass.
 */
export async function getOfferwallMeEmbed(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const pass = await consumeOfferwallPass({
      userId: user.id,
      provider: "offerwallme",
      passToken: extractPassToken(req as never),
    });
    if (!pass.ok) {
      res.status(pass.status).json({ ok: false, code: pass.code });
      return;
    }
    const publisherId = offerwallMePublisherId();
    const url = `https://offerwall.me/offerwall/${publisherId}/${user.id}`;
    res.json({ ok: true, url });
  } catch (error: unknown) {
    log.error("embed failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading embed." });
  }
}
