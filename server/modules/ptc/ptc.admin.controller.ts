import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import * as svc from "./ptc.service.js";
import * as repo from "./ptc.repository.js";
import {
  adminUpdateSettingsSchema,
  adminCreateTierSchema,
  adminUpdateTierSchema,
  adminRejectCampaignSchema,
} from "./ptc.schemas.js";

const log = logger.child("ptc.admin.controller");

function err(res: Response, status: number, msg: string): void {
  res.status(status).json({ ok: false, message: msg });
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Server error";
}

function parsePositiveIntId(val: unknown): number | null {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function getSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await svc.getSettings();
    res.json({ ok: true, settings });
  } catch (e: unknown) {
    log.error("getSettings failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminUpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      err(res, 400, "Invalid settings payload.");
      return;
    }
    await svc.updateSettings(parsed.data);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function listPending(_req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await repo.getPendingCampaigns();
    res.json({ ok: true, campaigns });
  } catch (e: unknown) {
    log.error("listPending failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function listAll(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const result = await repo.getAllCampaignsAdmin(
      Number.isInteger(page) && page > 0 ? page : 1,
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20,
    );
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    log.error("listAll failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function approve(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.id);
    if (!id) {
      err(res, 400, "Invalid campaign ID.");
      return;
    }
    await svc.approveCampaign(id);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.id);
    if (!id) {
      err(res, 400, "Invalid campaign ID.");
      return;
    }
    const parsed = adminRejectCampaignSchema.safeParse(req.body ?? {});
    const reason = parsed.success ? parsed.data.reason : "Policy violation";
    await svc.rejectCampaign(id, reason);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function getTiers(_req: Request, res: Response): Promise<void> {
  try {
    const tiers = await svc.getTiers();
    res.json({ ok: true, tiers });
  } catch (e: unknown) {
    log.error("getTiers failed", { error: String(e) });
    err(res, 500, "Server error");
  }
}

export async function createTier(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminCreateTierSchema.safeParse(req.body);
    if (!parsed.success) {
      err(res, 400, "label, durationSeconds, pricePerViewShib and rewardPerViewShib are required");
      return;
    }
    const tier = await svc.createTier(parsed.data);
    res.json({ ok: true, tier });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function updateTier(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.id);
    if (!id) {
      err(res, 400, "Invalid tier ID.");
      return;
    }
    const parsed = adminUpdateTierSchema.safeParse(req.body);
    if (!parsed.success) {
      err(res, 400, "Invalid tier payload.");
      return;
    }
    const tier = await svc.updateTier(id, parsed.data);
    res.json({ ok: true, tier });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

export async function deleteTier(req: Request, res: Response): Promise<void> {
  try {
    const id = parsePositiveIntId(req.params.id);
    if (!id) {
      err(res, 400, "Invalid tier ID.");
      return;
    }
    await svc.deleteTier(id);
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}

