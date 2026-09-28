import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { logAdminAction } from "../admin/index.js";
import * as svc from "./ptc.service.js";
import * as repo from "./ptc.repository.js";
import {
  adminUpdateSettingsSchema,
  adminCreateTierSchema,
  adminUpdateTierSchema,
  adminRejectCampaignSchema,
} from "./ptc.schemas.js";
import { err, errorMessage, parsePositiveIntId } from "./ptc.controller-helpers.js";

const log = logger.child("ptc.admin.controller");

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
    const oldSettings = await svc.getSettings().catch(() => null);
    await svc.updateSettings(parsed.data);
    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "PTC_SETTINGS_UPDATE",
      module: "ptc",
      resource: "ptc_settings",
      oldValue: oldSettings,
      newValue: parsed.data,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });
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
    const existing = await repo.getCampaignById(id);
    await svc.approveCampaign(id);
    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "PTC_CAMPAIGN_APPROVE",
      module: "ptc",
      resource: "ptp_ad",
      resourceId: String(id),
      newValue: { id, title: existing?.title, status: "active" },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });
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
    const existing = await repo.getCampaignById(id);
    await svc.rejectCampaign(id, reason);
    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "PTC_CAMPAIGN_REJECT",
      module: "ptc",
      resource: "ptp_ad",
      resourceId: String(id),
      newValue: { id, title: existing?.title, status: "rejected", reason },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });
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
    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "PTC_TIER_CREATE",
      module: "ptc",
      resource: "ptc_ad_tier",
      resourceId: String(tier.id),
      newValue: tier,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });
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
    const existing = await repo.getTierById(id);
    const tier = await svc.updateTier(id, parsed.data);
    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "PTC_TIER_UPDATE",
      module: "ptc",
      resource: "ptc_ad_tier",
      resourceId: String(id),
      oldValue: existing,
      newValue: tier,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });
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
    const existing = await repo.getTierById(id);
    await svc.deleteTier(id);
    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "PTC_TIER_DELETE",
      module: "ptc",
      resource: "ptc_ad_tier",
      resourceId: String(id),
      oldValue: existing,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      success: true,
    });
    res.json({ ok: true });
  } catch (e: unknown) {
    err(res, 400, errorMessage(e));
  }
}


