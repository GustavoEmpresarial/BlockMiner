/**
 * Multiwall Ads PTC HTTP handlers.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { consumeOfferwallPass, extractPassToken } from "../bm-captcha/index.js";
import * as multiwallService from "./multiwall.service.js";

const log = logger.child("multiwall.controller");

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string") return cfIp.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]!.replace(/^::ffff:/, "");
  }
  return String(req.ip ?? "").replace(/^::ffff:/, "");
}

export async function multiwallPostback(req: Request, res: Response): Promise<void> {
  const clientIp = getClientIp(req);
  if (!multiwallService.isIpAllowed(clientIp)) {
    log.warn("postback.ip_rejected", { ip: clientIp });
    // PTC Instruction sample: die('') on IP mismatch
    res.status(403).send("");
    return;
  }
  log.info("postback.ip_accepted", { ip: clientIp });
  const body = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
  const input = {
    hashuser: String(body.hashuser ?? "").trim(),
    amount: String(body.amount ?? "").trim(),
    amountus: String(body.amountus ?? "").trim(),
    transaction: String(body.transaction ?? "").trim(),
    userId: String(body.user_id ?? body.userId ?? "").trim(),
  };
  try {
    const result = await multiwallService.processPostback(input, clientIp);
    switch (result.kind) {
      case "ok":
        res.send("ok");
        return;
      case "er":
        res.send("er");
        return;
      case "empty":
        res.send("");
        return;
      case "internal":
        res.status(500).send("er");
        return;
    }
  } catch (error: unknown) {
    log.error("postback.unhandled", { error: String(error) });
    res.status(500).send("er");
  }
}

export async function getMultiwallHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const payload = await multiwallService.getHistoryForUser(user.id, page);
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    log.error("history failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading history." });
  }
}

export async function getMultiwallStats(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await multiwallService.getStatsForUser(user.id);
    res.json({ ok: true, ...payload });
  } catch (error: unknown) {
    log.error("stats failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading stats." });
  }
}

/** GET /api/multiwall/embed — captcha-gated iframe URL (pass optional while BM captcha off). */
export async function getMultiwallEmbed(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const pass = await consumeOfferwallPass({
      userId: user.id,
      provider: "multiwall",
      passToken: extractPassToken(req as never),
    });
    if (!pass.ok) {
      res.status(pass.status).json({ ok: false, code: pass.code });
      return;
    }
    const url = multiwallService.buildEmbedUrl(user.id);
    if (!url) {
      res.status(503).json({ ok: false, code: "MULTIWALL_MISCONFIGURED" });
      return;
    }
    res.json({ ok: true, url });
  } catch (error: unknown) {
    log.error("embed failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading embed." });
  }
}
