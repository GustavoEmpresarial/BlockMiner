/** Ported from legacy/server/modules/ptc/ptc.controller.ts (user-facing endpoints only — admin split into ptc.admin.controller.ts). */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as svc from "./ptc.service.js";
import {
  createCampaignSchema,
  editCampaignSchema,
  viewsAdjustSchema,
  startSessionSchema,
  cancelSessionSchema,
} from "./ptc.schemas.js";

const log = logger.child("ptc.controller");

function err(res: Response, status: number, msg: string): void {
  res.status(status).json({ ok: false, message: msg });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Server error";
}

// ── Settings / tiers (public) ─────────────────────────────────────────────────

export async function getSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await svc.getSettings();
    res.json({ ok: true, settings });
  } catch (e: unknown) {
    log.error("getSettings failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function getActiveTiers(_req: Request, res: Response): Promise<void> {
  try {
    const tiers = await svc.getActiveTiers();
    res.json({ ok: true, tiers });
  } catch (e: unknown) {
    log.error("getActiveTiers failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

// ── User: campaign creation & management ─────────────────────────────────────

export async function createCampaign(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) { err(res, 400, "Invalid campaign payload."); return; }

    await svc.createCampaign(user.id, parsed.data);
    res.json({ ok: true, message: "Campaign submitted for approval" });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function getMyCampaigns(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const campaigns = await svc.getMyCampaigns(user.id);
    res.json({ ok: true, campaigns });
  } catch (e: unknown) {
    log.error("getMyCampaigns failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function editCampaign(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const adId = Number(req.params.id);
    const parsed = editCampaignSchema.safeParse(req.body);
    if (!Number.isInteger(adId) || adId <= 0 || !parsed.success) { err(res, 400, "Invalid request."); return; }

    await svc.editCampaign(user.id, adId, parsed.data);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function addViews(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const adId = Number(req.params.id);
    const parsed = viewsAdjustSchema.safeParse(req.body);
    if (!Number.isInteger(adId) || adId <= 0 || !parsed.success) { err(res, 400, "Invalid views count"); return; }

    await svc.addViews(user.id, adId, parsed.data.views);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function removeViews(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const adId = Number(req.params.id);
    const parsed = viewsAdjustSchema.safeParse(req.body);
    if (!Number.isInteger(adId) || adId <= 0 || !parsed.success) { err(res, 400, "Invalid views count"); return; }

    await svc.removeViews(user.id, adId, parsed.data.views);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

// ── Viewer (earn SHIB by watching ads) ───────────────────────────────────────

export async function getAvailableAds(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const payload = await svc.getAvailableAds(user.id);
    res.json({ ok: true, ...payload });
  } catch (e: unknown) {
    log.error("getAvailableAds failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function getEarningsHistory(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const history = await svc.getEarningsHistory(user.id);
    res.json({ ok: true, history });
  } catch (e: unknown) {
    log.error("getEarningsHistory failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

// ── Session endpoints ─────────────────────────────────────────────────────────

export async function getActiveSession(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const session = await svc.getActiveSession(user.id);
    res.json({ ok: true, session: session ?? null });
  } catch (e: unknown) {
    log.error("getActiveSession failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function startSession(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsed = startSessionSchema.safeParse(req.body);
    if (!parsed.success) { err(res, 400, "adId required"); return; }

    const session = await svc.startSession(user.id, parsed.data.adId);
    res.json({ ok: true, session });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function heartbeat(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sessionId = String(req.params.sessionId);
    const session = await svc.heartbeat(sessionId, user.id);
    res.json({ ok: true, status: session.status, accumulatedMs: session.accumulatedMs });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function pauseSession(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sessionId = String(req.params.sessionId);
    const session = await svc.pauseSession(sessionId, user.id);
    res.json({ ok: true, status: session.status, accumulatedMs: session.accumulatedMs });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function cancelSession(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sessionId = String(req.params.sessionId);
    const parsed = cancelSessionSchema.safeParse(req.body ?? {});
    const reason = parsed.success ? parsed.data.reason : "user_cancelled";
    await svc.cancelSession(sessionId, user.id, reason);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function claimSession(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const sessionId = String(req.params.sessionId);
    await svc.claimSession(sessionId, user.id);
    res.json({ ok: true, message: "Recompensa creditada!" });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}
