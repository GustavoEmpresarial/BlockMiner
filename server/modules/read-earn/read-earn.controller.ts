import type { Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../../core/logger/index.js";
import { REDEEM_ALREADY, REDEEM_GENERIC } from "./read-earn.errors.js";
import { parseReadEarnRedeem } from "./read-earn.schemas.js";
import { listPublicReadEarnCampaigns, redeemReadEarnCampaign } from "./read-earn.service.js";

const log = logger.child("read-earn.controller");

export async function getPublicReadEarnCampaigns(_req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await listPublicReadEarnCampaigns();
    res.json({ ok: true, campaigns });
  } catch (e: unknown) {
    log.error("getPublicReadEarnCampaigns failed", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to load campaigns." });
  }
}

export async function postReadEarnRedeem(req: Request, res: Response): Promise<void> {
  try {
    const body = parseReadEarnRedeem(req.body || {});
    const userId = (req as { user?: { id?: number } }).user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, code: REDEEM_GENERIC, message: "Session invalid." });
      return;
    }
    const ip = req.ip || null;
    const userAgent = req.headers["user-agent"] || null;
    const result = await redeemReadEarnCampaign({
      userId,
      campaignId: body.campaignId,
      rawCode: body.code,
      ip,
      userAgent,
      logger: { error: (msg, meta) => log.error(msg, { error: String(meta) }) },
    });
    if (!result.ok) {
      const status = result.code === REDEEM_ALREADY ? 409 : 400;
      res.status(status).json({ ok: false, code: result.code, message: result.code });
      return;
    }
    res.json({ ok: true, code: "OK", reward: result.reward });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      res.status(400).json({ ok: false, code: REDEEM_GENERIC, message: "Invalid request." });
      return;
    }
    log.error("postReadEarnRedeem failed", { error: String(e) });
    res.status(500).json({ ok: false, code: REDEEM_GENERIC, message: "Redeem failed." });
  }
}

