/**
 * Admin fraud-signals routes — cluster listing and multi-accounting risk analysis.
 * Mounted at /fraud-signals inside adminRouter → inherits requireAdminAuth.
 * Full paths /api/admin/fraud-signals* unchanged.
 */
import express, { type Request, type Response, type Router } from "express";
import prisma from "../../core/database/prisma.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireAdminPermission } from "./admin.permissions.js";
import { logAdminAction } from "./admin.audit-log.service.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import { logger } from "../../core/logger/index.js";
import { getCachedIpIntelligence, normalizeIp } from "../ip-intelligence/index.js";
import {
  adminFraudSignalsQuerySchema,
  adminFraudRefreshIpSchema,
  adminFraudResetCollectionSchema,
} from "./admin.fraud-signals.schemas.js";
import {
  listAdminFraudSignals,
  resetAdminFraudCollectionData,
  getFraudCollectionResetConfirmPhrase,
  InvalidFraudQueryError,
} from "./admin.fraud-signals.service.js";

export const fraudSignalsAdminRouter: Router = express.Router();
const log = logger.child("AdminFraudSignals");

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "fraud_signals_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 60,
  name: "fraud_signals_admin_write",
});

const resetLimiter = createDistributedRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  name: "fraud_signals_admin_reset",
});

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

fraudSignalsAdminRouter.get(
  "/",
  readLimiter,
  requireAdminPermission("fraud_signals.view", "fraud_signals"),
  async (req: Request, res: Response) => {
    try {
      const parsed = adminFraudSignalsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
        return;
      }

      const data = await listAdminFraudSignals(prisma, parsed.data);
      res.json({ ok: true, ...data });
    } catch (error: unknown) {
      if (error instanceof InvalidFraudQueryError) {
        res.status(400).json({ ok: false, code: "invalid_query", message: "Invalid fraud signal query." });
        return;
      }
      log.error("[admin fraud-signals]", { error: errMsg(error) });
      res.status(500).json({ ok: false, code: "internal_error", message: "Error loading fraud signals." });
    }
  }
);

fraudSignalsAdminRouter.post(
  "/refresh-ip",
  writeLimiter,
  requireAdminPermission("fraud_signals"),
  async (req: Request, res: Response) => {
    const bodyParsed = adminFraudRefreshIpSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }

    const ip = normalizeIp(bodyParsed.data.ip);
    if (!ip) {
      res.status(400).json({ ok: false, code: "invalid_ip", message: "Invalid or missing IP address." });
      return;
    }

    try {
      const forceRefresh = bodyParsed.data.forceRefresh;
      const intelligence = await getCachedIpIntelligence(prisma, ip, { forceRefresh });

      void logAdminAction({
        adminId: req.admin?.adminId ?? null,
        adminEmail: req.admin?.email ?? null,
        sessionId: req.admin?.sessionId ?? null,
        action: "ADMIN_FRAUD_REFRESH_IP",
        module: "admin",
        resource: "FraudIpIntelligence",
        resourceId: ip,
        newValue: { ip, forceRefresh, providerType: intelligence?.providerType },
        ipAddress: getClientIp(req),
        userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
      });

      res.json({ ok: true, ip, intelligence });
    } catch (error: unknown) {
      log.error("[admin fraud-signals refresh-ip]", { error: errMsg(error) });
      res.status(500).json({ ok: false, code: "internal_error", message: "Unable to refresh IP intelligence." });
    }
  }
);

fraudSignalsAdminRouter.post(
  "/reset-collection",
  resetLimiter,
  requireAdminPermission("fraud_signals"),
  async (req: Request, res: Response) => {
    try {
      const parsed = adminFraudResetCollectionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
        return;
      }

      const confirm = parsed.data.confirm;
      if (confirm !== getFraudCollectionResetConfirmPhrase()) {
        res.status(400).json({ ok: false, code: "phrase_mismatch", message: "Confirmation phrase mismatch." });
        return;
      }

      const { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared } =
        await resetAdminFraudCollectionData(prisma);

      await logAdminAction({
        adminId: req.admin?.adminId ?? null,
        adminEmail: req.admin?.email ?? null,
        sessionId: req.admin?.sessionId ?? null,
        action: "ADMIN_FRAUD_RESET_COLLECTION",
        module: "admin",
        resource: "FraudCollection",
        resourceId: "all",
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
      res.status(500).json({ ok: false, code: "internal_error", message: "Unable to reset fraud collection data." });
    }
  }
);
