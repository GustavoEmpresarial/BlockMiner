import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { readErrorCode, requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { httpStatusForBurnCode } from "./burn-events.errors.js";
import * as svc from "./burn-events.service.js";

const log = logger.child("burn-events.controller");

export async function listActive(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  try {
    const events = await svc.listActiveEvents(userId);
    res.json({ ok: true, events });
  } catch (err) {
    log.error("listActive", { error: String(err) });
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function myMachines(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const machines = await svc.getUserBurnableMachines(user.id);
    res.json({ ok: true, machines });
  } catch (err) {
    log.error("myMachines", { error: String(err) });
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function start(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const eventId = parseInt(String(req.params.id), 10);
  if (!eventId) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const { minerIds } = req.body as { minerIds?: unknown };
  if (!Array.isArray(minerIds)) {
    res.status(400).json({ ok: false, message: "minerIds must be an array of UserOwnedMachine ids" });
    return;
  }
  try {
    const result = await svc.startBurnEvent(user.id, eventId, minerIds);
    res.json(result);
  } catch (err) {
    const code = readErrorCode(err) ?? "ERROR";
    const msg = err instanceof Error ? err.message : String(err);
    res.status(httpStatusForBurnCode(code)).json({ ok: false, code, message: msg });
  }
}

export async function claim(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const eventId = parseInt(String(req.params.id), 10);
  if (!eventId) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const { sessionId } = req.body as { sessionId?: unknown };
  try {
    const result = await svc.claimBurnEvent(user.id, eventId, sessionId);
    res.json(result);
  } catch (err) {
    const code = readErrorCode(err) ?? "ERROR";
    const msg = err instanceof Error ? err.message : String(err);
    res.status(httpStatusForBurnCode(code)).json({ ok: false, code, message: msg });
  }
}
