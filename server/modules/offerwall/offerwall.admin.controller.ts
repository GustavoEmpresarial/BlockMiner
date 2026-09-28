/**
 * Offerwall Admin Controller — analytics reporting endpoints.
 * Reimplemented in strict TypeScript without `@ts-nocheck`.
 */
import type { Request, Response } from "express";
import {
  sanitizeAdminDateRange,
  parseOptionalUserId,
  getOfferwallAnalyticsReport,
} from "./offerwall.service.js";
import { logger } from "../../core/logger/index.js";
import { safeClientErrorMessage } from "../../shared/errors/prismaHttpErrors.js";

const log = logger.child("offerwall.admin.controller");

export async function getOfferwallAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const parsed = sanitizeAdminDateRange(req.query.from, req.query.to);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, message: parsed.message });
      return;
    }

    const { from, to, serverNow } = parsed.range;

    const rawUserId = req.query.userId;
    const userId = parseOptionalUserId(rawUserId);
    if (rawUserId != null && rawUserId !== "" && userId == null) {
      res.status(400).json({ ok: false, message: "Invalid userId" });
      return;
    }

    const report = await getOfferwallAnalyticsReport({ userId, from, to, serverNow });
    res.json({ ok: true, ...report });
  } catch (err: unknown) {
    log.error("getOfferwallAnalytics_failed", { error: String(err) });
    res.status(500).json({
      ok: false,
      message: safeClientErrorMessage(err, "Erro ao carregar analytics de offerwall."),
    });
  }
}
