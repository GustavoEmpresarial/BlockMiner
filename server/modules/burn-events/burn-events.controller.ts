import type { Request, Response } from "express";
import { reportError } from "../../core/errors/error-reporter.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../core/http/middleware/idempotency.js";
import { readErrorCode, requireSessionUser } from "../../shared/errors/httpStatusError.js";
import {
  httpStatusForBurnCode,
  isBurnEventsErrorCode,
  publicMessageForBurnCode,
} from "./burn-events.errors.js";
import * as svc from "./burn-events.service.js";

function sendBurnFailure(req: Request, res: Response, err: unknown, fallbackCode: string): void {
  const code = readErrorCode(err) ?? fallbackCode;
  const known = isBurnEventsErrorCode(code);
  const status = known ? httpStatusForBurnCode(code) : 500;
  if (!known || status >= 500) {
    const { fingerprint } = reportError({
      code: known ? code : fallbackCode,
      category: "DATABASE",
      severity: "ERROR",
      module: "burn-events",
      error: err,
      req,
      context: { userId: req.user?.id, path: req.path },
    });
    res.status(status >= 500 ? 500 : status).json({
      ok: false,
      code: known ? code : fallbackCode,
      message: publicMessageForBurnCode(known ? code : fallbackCode, "Burn request failed."),
      fingerprint,
    });
    return;
  }
  const msg = err instanceof Error ? err.message : publicMessageForBurnCode(code);
  res.status(status).json({
    ok: false,
    code,
    message: msg || publicMessageForBurnCode(code),
  });
}

export async function listActive(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  try {
    const events = await svc.listActiveEvents(userId);
    res.json({ ok: true, events });
  } catch (err) {
    sendBurnFailure(req, res, err, "BURN_EVENTS_LIST_FAILED");
  }
}

export async function myMachines(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const machines = await svc.getUserBurnableMachines(user.id);
    res.json({ ok: true, machines });
  } catch (err) {
    sendBurnFailure(req, res, err, "BURN_EVENTS_MACHINES_FAILED");
  }
}

export async function pendingSession(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    res.status(400).json({ ok: false, code: "VALIDATION_ERROR", message: "Invalid id" });
    return;
  }
  try {
    const session = await svc.getPendingBurnSession(user.id, eventId);
    res.json({ ok: true, session });
  } catch (err) {
    sendBurnFailure(req, res, err, "BURN_EVENTS_SESSION_FAILED");
  }
}

export async function start(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const eventId = Number(req.params.id);
  const body = req.body as { minerIds: unknown; feeCurrency: unknown };
  const idem = await resolveCriticalMutation(req, res);
  if (!idem) return;
  try {
    const result = await svc.startBurnEvent(user.id, eventId, body.minerIds, body.feeCurrency);
    await finalizeCriticalMutationSuccess(idem.lease, {
      requestHash: idem.ci.requestHash,
      responseJson: result,
    });
    res.json(result);
  } catch (err) {
    await cancelCriticalMutation(idem.lease);
    sendBurnFailure(req, res, err, "BURN_EVENTS_START_FAILED");
  }
}

export async function claim(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  const eventId = Number(req.params.id);
  const { sessionId } = req.body as { sessionId: unknown };
  const idem = await resolveCriticalMutation(req, res);
  if (!idem) return;
  try {
    const result = await svc.claimBurnEvent(user.id, eventId, sessionId);
    await finalizeCriticalMutationSuccess(idem.lease, {
      requestHash: idem.ci.requestHash,
      responseJson: result,
    });
    res.json(result);
  } catch (err) {
    await cancelCriticalMutation(idem.lease);
    sendBurnFailure(req, res, err, "BURN_EVENTS_CLAIM_FAILED");
  }
}
