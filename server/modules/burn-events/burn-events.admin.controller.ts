import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { parseOptionalDate } from "./burn-events.helpers.js";
import * as svc from "./burn-events.service.js";

const log = logger.child("burn-events.admin");

export async function listAll(_req: Request, res: Response): Promise<void> {
  try {
    const events = await svc.adminListEvents();
    res.json({ ok: true, events });
  } catch (err) {
    log.error("listAll", { error: String(err) });
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const b = req.body as Record<string, unknown>;
  try {
    const event = await svc.adminCreateEvent({
      title: String(b.title ?? ""),
      description: b.description != null ? String(b.description) : null,
      imageUrl: b.imageUrl != null ? String(b.imageUrl) : null,
      requiredHashRate: Number(b.requiredHashRate),
      rewardMinerId: Number(b.rewardMinerId),
      claimLimitPerUser: b.claimLimitPerUser != null ? Number(b.claimLimitPerUser) : 1,
      stockTotal: b.stockTotal != null && b.stockTotal !== "" ? Number(b.stockTotal) : null,
      startsAt: parseOptionalDate(b.startsAt),
      endsAt: parseOptionalDate(b.endsAt),
      isActive: b.isActive !== false,
    });
    res.json({ ok: true, event });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  try {
    const patch: Partial<svc.AdminEventInput> = {};
    if (b.title !== undefined) patch.title = String(b.title);
    if (b.description !== undefined) patch.description = b.description != null ? String(b.description) : null;
    if (b.imageUrl !== undefined) patch.imageUrl = b.imageUrl != null ? String(b.imageUrl) : null;
    if (b.requiredHashRate !== undefined) patch.requiredHashRate = Number(b.requiredHashRate);
    if (b.rewardMinerId !== undefined) patch.rewardMinerId = Number(b.rewardMinerId);
    if (b.claimLimitPerUser !== undefined) patch.claimLimitPerUser = Number(b.claimLimitPerUser);
    if (b.stockTotal !== undefined) {
      patch.stockTotal = b.stockTotal != null && b.stockTotal !== "" ? Number(b.stockTotal) : null;
    }
    if (b.startsAt !== undefined) patch.startsAt = parseOptionalDate(b.startsAt);
    if (b.endsAt !== undefined) patch.endsAt = parseOptionalDate(b.endsAt);
    if (b.isActive !== undefined) patch.isActive = Boolean(b.isActive);
    const event = await svc.adminUpdateEvent(id, patch);
    res.json({ ok: true, event });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    await svc.adminSoftDeleteEvent(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function claims(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const page = parseInt(String(req.query.page ?? "1"), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const data = await svc.adminListClaims(id, page);
    res.json({ ok: true, ...data });
  } catch (err) {
    log.error("claims", { error: String(err) });
    res.status(500).json({ ok: false, message: String(err) });
  }
}
