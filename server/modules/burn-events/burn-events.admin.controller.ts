import type { Request, Response } from "express";
import { reportError } from "../../core/errors/error-reporter.js";
import { parseOptionalDate } from "./burn-events.helpers.js";
import * as svc from "./burn-events.service.js";

function sendAdminFailure(req: Request, res: Response, err: unknown, code: string, status = 400): void {
  reportError({
    code,
    category: status >= 500 ? "DATABASE" : "BUSINESS",
    severity: status >= 500 ? "ERROR" : "WARNING",
    module: "burn-events.admin",
    error: err,
    req,
  });
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).json({
    ok: false,
    code,
    message: status >= 500 ? "Admin burn-events request failed." : message,
  });
}

export async function listAll(req: Request, res: Response): Promise<void> {
  try {
    const events = await svc.adminListEvents();
    res.json({ ok: true, events });
  } catch (err) {
    sendAdminFailure(req, res, err, "BURN_EVENTS_ADMIN_LIST_FAILED", 500);
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
      claimLimitPerUser: b.claimLimitPerUser != null ? Number(b.claimLimitPerUser) : undefined,
      stockTotal: b.stockTotal === undefined ? undefined : b.stockTotal == null ? null : Number(b.stockTotal),
      startsAt: parseOptionalDate(b.startsAt),
      endsAt: parseOptionalDate(b.endsAt),
      isActive: b.isActive !== false,
    });
    res.json({ ok: true, event });
  } catch (err) {
    sendAdminFailure(req, res, err, "BURN_EVENTS_ADMIN_CREATE_FAILED");
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid id" });
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
    sendAdminFailure(req, res, err, "BURN_EVENTS_ADMIN_UPDATE_FAILED");
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid id" });
    return;
  }
  try {
    await svc.adminSoftDeleteEvent(id);
    res.json({ ok: true });
  } catch (err) {
    sendAdminFailure(req, res, err, "BURN_EVENTS_ADMIN_DELETE_FAILED");
  }
}

export async function claims(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const page = Number(req.query.page ?? "1");
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid id" });
    return;
  }
  try {
    const data = await svc.adminListClaims(id, Number.isInteger(page) && page > 0 ? page : 1);
    res.json({ ok: true, ...data });
  } catch (err) {
    sendAdminFailure(req, res, err, "BURN_EVENTS_ADMIN_CLAIMS_FAILED", 500);
  }
}
