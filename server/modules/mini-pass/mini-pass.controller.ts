import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { claimMiniPassLevelReward } from "./mini-pass.claim.service.js";
import { getMiniPassSeasonDashboard, listLiveMiniPassSeasons } from "./mini-pass.dashboard.service.js";
import { purchaseMiniPassComplete, purchaseMiniPassLevels } from "./mini-pass.purchase.service.js";

const log = logger.child("mini-pass.controller");

function langFromReq(req: Request): string {
  const raw = req.headers["accept-language"];
  if (Array.isArray(raw)) return raw[0] ?? "en";
  return typeof raw === "string" ? raw : "en";
}

function parseSeasonIdParam(req: Request, res: Response): number | null {
  const id = parseInt(String(req.params.seasonId), 10);
  if (!id || id <= 0) {
    res.status(400).json({ ok: false, code: "invalid_season", message: "Invalid season." });
    return null;
  }
  return id;
}

export async function listMiniPassSeasons(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const rows = await listLiveMiniPassSeasons(langFromReq(req));
    res.json({ ok: true, seasons: rows });
  } catch (e: unknown) {
    log.error("listMiniPassSeasons", { error: String(e) });
    res.status(500).json({ ok: false, code: "error", message: "Failed to list seasons." });
  }
}

export async function getMiniPassSeason(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const seasonId = parseSeasonIdParam(req, res);
    if (seasonId === null) return;

    const data = await getMiniPassSeasonDashboard(user.id, seasonId, langFromReq(req));
    if (!data.ok) {
      res.status(data.status ?? 500).json({ ok: false, code: data.code, message: data.code });
      return;
    }
    const { ok: _ok, ...rest } = data;
    res.json({ ok: true, ...rest });
  } catch (e: unknown) {
    log.error("getMiniPassSeason", { error: String(e) });
    res.status(500).json({ ok: false, code: "error", message: "Failed to load season." });
  }
}

export async function postClaimMiniPassReward(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const seasonId = parseSeasonIdParam(req, res);
    if (seasonId === null) return;
    const levelRewardId = parseInt(String(req.params.levelRewardId), 10);
    if (!levelRewardId || levelRewardId <= 0) {
      res.status(400).json({ ok: false, code: "invalid_params", message: "Invalid params." });
      return;
    }
    const r = await claimMiniPassLevelReward(user.id, seasonId, levelRewardId);
    if (!r.ok) {
      const err = r as { status: number; code: string };
      res.status(err.status ?? 500).json({ ok: false, code: err.code, message: err.code });
      return;
    }
    res.json({
      ok: true,
      duplicate: r.duplicate,
      summary: r.summary,
    });
  } catch (e: unknown) {
    log.error("postClaimMiniPassReward", { error: String(e) });
    res.status(500).json({ ok: false, code: "error", message: "Claim failed." });
  }
}

export async function postBuyMiniPassLevels(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const seasonId = parseSeasonIdParam(req, res);
    if (seasonId === null) return;
    const quantity = Math.floor(Number(req.body?.quantity ?? 1));
    const r = await purchaseMiniPassLevels(user.id, seasonId, quantity);
    if (!r.ok) {
      const err = r as { status: number; code: string };
      res.status(err.status ?? 500).json({ ok: false, code: err.code, message: err.code });
      return;
    }
    res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
  } catch (e: unknown) {
    log.error("postBuyMiniPassLevels", { error: String(e) });
    res.status(500).json({ ok: false, code: "error", message: "Purchase failed." });
  }
}

export async function postCompleteMiniPass(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const seasonId = parseSeasonIdParam(req, res);
    if (seasonId === null) return;
    const r = await purchaseMiniPassComplete(user.id, seasonId);
    if (!r.ok) {
      const err = r as { status: number; code: string };
      res.status(err.status ?? 500).json({ ok: false, code: err.code, message: err.code });
      return;
    }
    res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
  } catch (e: unknown) {
    log.error("postCompleteMiniPass", { error: String(e) });
    res.status(500).json({ ok: false, code: "error", message: "Purchase failed." });
  }
}
