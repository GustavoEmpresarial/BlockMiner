/** Ported from legacy/server/modules/internal-offerwall/internal-offerwall.admin.controller.ts. */
import type { Request, Response } from "express";
import type { InternalOfferwallOffer } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import * as service from "./internal-offerwall.service.js";
import { idParamSchema, adminListAttemptsQuerySchema, adminRejectAttemptBodySchema } from "./internal-offerwall.schemas.js";

const log = logger.child("internal-offerwall.admin.controller");

function offerToPlain(row: InternalOfferwallOffer | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    kind: row.kind,
    title: row.title,
    description: row.description,
    iframeUrl: row.iframeUrl,
    minViewSeconds: row.minViewSeconds,
    rewardKind: row.rewardKind,
    rewardBlkAmount: row.rewardBlkAmount != null ? Number(row.rewardBlkAmount) : null,
    rewardPolAmount: row.rewardPolAmount != null ? Number(row.rewardPolAmount) : null,
    rewardHashRate: row.rewardHashRate,
    rewardHashRateDays: row.rewardHashRateDays,
    dailyLimitPerUser: row.dailyLimitPerUser,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    completionMode: row.completionMode,
    taskMetadata: row.taskMetadata && typeof row.taskMetadata === "object" ? row.taskMetadata : null,
  };
}

export async function listOffers(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await service.adminListOffers();
    res.json({ ok: true, offers: rows });
  } catch (error: unknown) {
    log.error("listOffers failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to list offers." });
  }
}

export async function createOffer(req: Request, res: Response): Promise<void> {
  try {
    const parsed = await service.parseAdminOfferBody(prisma, req.body as object);
    if (!parsed.ok) {
      const payload: Record<string, unknown> = { ok: false, message: parsed.message, code: parsed.code };
      if (parsed.details) payload.details = parsed.details;
      res.status(parsed.status).json(payload);
      return;
    }
    const row = await service.adminCreateOffer(parsed.data);
    res.status(201).json({ ok: true, offer: row });
  } catch (error: unknown) {
    log.error("createOffer failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to create offer." });
  }
}

export async function patchOffer(req: Request, res: Response): Promise<void> {
  try {
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const { id } = parsedParams.data;
    const existing = await service.adminFindOfferById(id);
    if (!existing) {
      res.status(404).json({ ok: false, message: "Offer not found." });
      return;
    }
    const bodyObj = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const merged = { ...offerToPlain(existing), ...bodyObj } as object;
    const parsed = await service.parseAdminOfferBody(prisma, merged);
    if (!parsed.ok) {
      const payload: Record<string, unknown> = { ok: false, message: parsed.message, code: parsed.code };
      if (parsed.details) payload.details = parsed.details;
      res.status(parsed.status).json(payload);
      return;
    }
    const row = await service.adminPatchOffer(id, parsed.data);
    res.json({ ok: true, offer: row });
  } catch (error: unknown) {
    log.error("patchOffer failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to update offer." });
  }
}

export async function listAttempts(req: Request, res: Response): Promise<void> {
  try {
    const parsedQuery = adminListAttemptsQuerySchema.safeParse(req.query);
    const q = parsedQuery.success ? parsedQuery.data : {};
    const rows = await service.adminListAttempts({ status: q.status, offerId: q.offerId, limit: q.limit });
    res.json({ ok: true, attempts: rows });
  } catch (error: unknown) {
    log.error("listAttempts failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to list attempts." });
  }
}

export async function approveAttempt(req: Request, res: Response): Promise<void> {
  try {
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const out = await service.adminApproveAttempt(parsedParams.data.id);
    if (!out.ok) {
      res.status(out.status ?? 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    log.error("approveAttempt failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to approve attempt." });
  }
}

export async function listFrameHosts(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await service.adminListFrameHosts();
    res.json({ ok: true, frameHosts: rows });
  } catch (error: unknown) {
    log.error("listFrameHosts failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to list frame hosts." });
  }
}

export async function deactivateFrameHost(req: Request, res: Response): Promise<void> {
  try {
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid frame host id." });
      return;
    }
    const out = await service.adminDeactivateFrameHostById(parsedParams.data.id);
    if (!out.ok) {
      res.status(out.status ?? 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    log.error("deactivateFrameHost failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to update frame host." });
  }
}

export async function rejectAttempt(req: Request, res: Response): Promise<void> {
  try {
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const parsedBody = adminRejectAttemptBodySchema.safeParse(req.body ?? {});
    const note = parsedBody.success ? (parsedBody.data.note ?? undefined) : undefined;
    const out = await service.adminRejectAttempt(parsedParams.data.id, note ?? undefined);
    if (!out.ok) {
      res.status(out.status ?? 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (error: unknown) {
    log.error("rejectAttempt failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to reject attempt." });
  }
}
