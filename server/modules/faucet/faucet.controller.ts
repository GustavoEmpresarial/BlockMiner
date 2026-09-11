/** Ported from legacy/server/modules/faucet/faucet.controller.ts. */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import {
  assertFeatureTurnstile,
  featureTurnstileDenyBody,
} from "../../shared/security/featureTurnstileGate.js";
import * as faucetService from "./faucet.service.js";

const log = logger.child("faucet.controller");

function clientIp(req: Request): string | undefined {
  return typeof req.ip === "string" ? req.ip : undefined;
}

function bodyToken(req: Request): unknown {
  const body = req.body as { cfTurnstileToken?: unknown } | undefined;
  return body?.cfTurnstileToken;
}

export async function startPartnerVisit(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const gate = await assertFeatureTurnstile("faucet", user.id, bodyToken(req), clientIp(req));
    if (!gate.ok) {
      res.status(400).json(featureTurnstileDenyBody(gate.code));
      return;
    }
    const payload = await faucetService.startPartnerVisitForUser(user.id);
    res.json(payload);
  } catch (error: unknown) {
    log.error("startPartnerVisit failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error starting visit." });
  }
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await faucetService.getStatusForUser(user.id);
    res.json(payload);
  } catch (error: unknown) {
    log.error("getStatus failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error loading status." });
  }
}

export async function claim(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const result = await faucetService.claimForUser(user.id, req);
    if (!result.ok) {
      const body: Record<string, unknown> = { ok: false, message: result.message };
      if (result.remainingMs != null) body.remainingMs = result.remainingMs;
      res.status(result.status).json(body);
      return;
    }
    try {
      await syncUserBaseHashRate(user.id);
    } catch (syncErr: unknown) {
      log.warn("faucet hashrate sync failed", { error: String(syncErr) });
    }
    res.json({ ok: true, message: result.message, nextAvailableAt: result.nextAvailableAt });
  } catch (error: unknown) {
    log.error("claim failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error claiming faucet." });
  }
}
