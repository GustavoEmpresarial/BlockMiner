/**
 * Admin fraud-signals routes — cluster listing and multi-accounting risk analysis.
 * Mounted at /fraud-signals inside adminRouter → inherits requireAdminAuth.
 * Full paths /api/admin/fraud-signals* unchanged.
 */
import express, { type Request, type Response, type Router } from "express";
import prisma from "../../core/database/prisma.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { logAdminAction } from "./admin.audit-log.service.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import { logger } from "../../core/logger/index.js";
import { getCachedIpIntelligence, normalizeIp } from "../ip-intelligence/index.js";
import {
  listAdminFraudSignals,
  resetAdminFraudCollectionData,
  getFraudCollectionResetConfirmPhrase,
  InvalidFraudQueryError,
} from "./admin.fraud-signals.service.js";

export const fraudSignalsAdminRouter: Router = express.Router();
const log = logger.child("AdminFraudSignals");

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

fraudSignalsAdminRouter.get("/", async (req: Request, res: Response) => {
  try {
    const data = await listAdminFraudSignals(prisma, {
      scope: req.query.scope,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json({ ok: true, ...data });
  } catch (error: unknown) {
    if (error instanceof InvalidFraudQueryError) {
      res.status(400).json({ ok: false, message: "Invalid fraud signal query." });
      return;
    }
    log.error("[admin fraud-signals]", { error: errMsg(error) });
    res.status(500).json({ ok: false, message: "Error" });
  }
});

fraudSignalsAdminRouter.post("/refresh-ip", async (req: Request, res: Response) => {
  const ip = normalizeIp(req.body?.ip ?? req.query.ip);
  if (!ip) {
    res.status(400).json({ ok: false, message: "Invalid or missing IP address." });
    return;
  }
  try {
    const forceRefresh = req.body?.forceRefresh === true || String(req.query.forceRefresh ?? "") === "1";
    const intelligence = await getCachedIpIntelligence(prisma, ip, { forceRefresh });
    res.json({ ok: true, ip, intelligence });
  } catch (error: unknown) {
    log.error("[admin fraud-signals refresh-ip]", { error: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to refresh IP intelligence." });
  }
});

const fraudResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many fraud data reset requests. Try again later.",
});

fraudSignalsAdminRouter.post("/reset-collection", fraudResetLimiter, async (req: Request, res: Response) => {
  try {
    const confirm = String(req.body?.confirm ?? "").trim();
    if (confirm !== getFraudCollectionResetConfirmPhrase()) {
      res.status(400).json({ ok: false, message: "Confirmation phrase mismatch." });
      return;
    }
    const { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared } = await resetAdminFraudCollectionData(prisma);
    await logAdminAction({
      adminId: req.admin?.adminId ?? null,
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ADMIN_FRAUD_RESET_COLLECTION",
      module: "admin",
      resource: "FraudCollection",
      newValue: { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared },
      ipAddress: getClientIp(req),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
    });
    res.json({
      ok: true,
      message: "Fraud collection data cleared.",
      ipLogsDeleted,
      ipIntelDeleted,
      usersProfileAntiFraudCleared,
    });
  } catch (error: unknown) {
    log.error("[admin fraud-signals reset-collection]", { error: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to reset fraud collection data." });
  }
});
