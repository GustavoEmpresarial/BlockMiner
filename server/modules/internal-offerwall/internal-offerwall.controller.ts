/** Ported from legacy/server/modules/internal-offerwall/internal-offerwall.controller.ts. */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { resolveCriticalMutation, finalizeCriticalMutationSuccess, cancelCriticalMutation } from "../../core/http/middleware/idempotency.js";
import { logger } from "../../core/logger/index.js";
import * as service from "./internal-offerwall.service.js";
import { isInternalOfferwallEnabled } from "./internal-offerwall.config.js";
import { attemptIdParamSchema, offerIdParamSchema } from "./internal-offerwall.schemas.js";
import { classifyInfrastructureError } from "../../shared/errors/prismaHttpErrors.js";

const log = logger.child("internal-offerwall.controller");

export async function getOffers(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const out = await service.userListOffers(user.id);
    if (!out.ok) {
      res.status(403).json({ ok: false, code: out.code, offers: [], openAttempts: [] });
      return;
    }
    res.json({ ok: true, dailyReset: out.dailyReset, offers: out.offers, openAttempts: out.openAttempts });
  } catch (error: unknown) {
    log.error("getOffers failed", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to load offers." });
  }
}

export async function postStart(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsedParams = offerIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid offer id." });
      return;
    }
    const { offerId } = parsedParams.data;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await service.userStartOffer(user.id, offerId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        const payload: Record<string, unknown> = { ok: false, code: out.code, message: out.message };
        if ("secondsUntilReset" in out) payload.secondsUntilReset = out.secondsUntilReset;
        res.status(out.status).json(payload);
        return;
      }
      const okPayload = { ok: true as const, attempt: out.attempt };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(lease);
      log.error("postStart failed", { error: String(inner) });
      res.status(500).json({ ok: false, message: "Failed to start offer." });
    }
  } catch (error: unknown) {
    log.error("postStart fatal error", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to start offer." });
  }
}

export async function postPartnerOpened(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsedParams = attemptIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const { attemptId } = parsedParams.data;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await service.userMarkPartnerOpened(user.id, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        res.status(out.status).json({ ok: false, code: out.code, message: out.message });
        return;
      }
      const okPayload = { ok: true as const, partnerOpenedAt: out.partnerOpenedAt };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(lease);
      log.error("postPartnerOpened failed", { error: String(inner) });
      res.status(500).json({ ok: false, message: "Failed to record partner open." });
    }
  } catch (error: unknown) {
    log.error("postPartnerOpened fatal error", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to record partner open." });
  }
}

export async function postAbandon(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsedParams = attemptIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const { attemptId } = parsedParams.data;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await service.userAbandonAttempt(user.id, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        res.status(out.status).json({ ok: false, code: out.code, message: out.message });
        return;
      }
      const okPayload = { ok: true as const, alreadyCleared: Boolean(out.alreadyCleared), deleted: out.deleted === true };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(lease);
      log.error("postAbandon failed", { error: String(inner) });
      res.status(500).json({ ok: false, message: "Failed to abandon attempt." });
    }
  } catch (error: unknown) {
    log.error("postAbandon fatal error", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to abandon attempt." });
  }
}

export async function postSubmit(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const parsedParams = attemptIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const { attemptId } = parsedParams.data;

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      const out = await service.userSubmitAttempt(user.id, attemptId);
      if (!out.ok) {
        await cancelCriticalMutation(lease);
        res.status(out.status).json({ ok: false, code: out.code, message: out.message });
        return;
      }
      const okPayload = { ok: true as const, status: out.status, message: out.message };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: okPayload });
      res.json(okPayload);
    } catch (inner: unknown) {
      await cancelCriticalMutation(lease);
      log.error("postSubmit failed", { error: String(inner) });
      const infra = classifyInfrastructureError(inner);
      if (infra) {
        res.status(infra.status).json({ ok: false, code: infra.code, message: infra.message, retryable: true });
        return;
      }
      res.status(500).json({ ok: false, code: "OFFERWALL_SUBMIT_FAILED", message: "Failed to submit attempt." });
    }
  } catch (error: unknown) {
    log.error("postSubmit fatal error", { error: String(error) });
    res.status(500).json({ ok: false, message: "Failed to submit attempt." });
  }
}

export function getFeatureStatus(_req: Request, res: Response): void {
  res.json({ ok: true, enabled: isInternalOfferwallEnabled() });
}
