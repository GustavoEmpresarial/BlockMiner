/**
 * Public + admin HTTP handlers for antibot.
 * Telemetry is fire-and-forget (always 200). Admin routes require requireAdminAuth upstream.
 */
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import { appendSetCookie, clearAuthCookies } from "../../shared/security/cookies.js";
import { AUTH_LOGIN_MESSAGES } from "../auth/auth.errors.js";
import { applyAnonymousSessionEviction } from "../auth/login/login.anonymous-evict.js";
import { logAdminAction } from "../admin/index.js";
import { bandForScore } from "./antibot.riskEngine.js";
import {
  antibotIdParamSchema,
  antibotUserIdParamSchema,
  adminAntibotOverviewQuerySchema,
  adminAntibotListEvidenceQuerySchema,
  adminAntibotListSessionsQuerySchema,
  adminAntibotListDevicesQuerySchema,
  adminAntibotListAlertsQuerySchema,
  adminUpdateAlertSchema,
  adminSetTrustedSchema,
  adminUserProfileQuerySchema,
} from "./antibot.schemas.js";
import {
  collectTelemetry as collectTelemetryService,
  getAntibotAdminOverview,
  getAntibotUserProfile,
  listAntibotAlerts,
  listAntibotDevices,
  listAntibotEvidence,
  listAntibotSessions,
  recomputeAntibotUserScore,
  resetAntibot,
  sanitizeTelemetry,
  setAntibotUserTrusted,
  updateAntibotAlert,
} from "./antibot.service.js";
import {
  blockedManagersFromTelemetry,
  userscriptManagerKickEnabled,
} from "./antibot.userscript-kick.js";

const log = logger.child("antibot.controller");

function sessionUserId(req: Request): number | null {
  const u = (req as Request & { user?: { id?: number } }).user;
  const id = u?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function adminActorId(req: Request): number | null {
  const adm = (req as Request & { admin?: { adminId?: number } }).admin;
  const id = adm?.adminId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function readUserAgent(req: Request): string {
  const raw = req.headers["user-agent"];
  return Array.isArray(raw) ? String(raw[0] ?? "") : String(raw ?? "");
}

/** POST /telemetry — auth optional. Always 200 { ok: true }. May include kick. */
export async function collectTelemetry(req: Request, res: Response): Promise<void> {
  try {
    const eventType = String(req.body?.eventType ?? "telemetry").slice(0, 40);
    const sessionId = String(req.body?.sessionId ?? "").slice(0, 80) || `anon-${randomUUID()}`;
    const userId = sessionUserId(req);
    const ip = getClientIp(req);
    const userAgent = readUserAgent(req);
    const rawTelemetry = req.body?.telemetry ?? req.body;
    void collectTelemetryService(prisma, {
      userId,
      sessionId,
      eventType,
      ip,
      userAgent,
      telemetry: rawTelemetry,
    }).catch((err) =>
      log.warn("telemetry_analyze_failed", { err: err instanceof Error ? err.message : String(err) }),
    );

    // Product rule: TM/VM present → kill session + tell client to show login reason.
    if (userscriptManagerKickEnabled() && userId) {
      const managers = blockedManagersFromTelemetry(rawTelemetry);
      if (managers.length > 0) {
        try {
          await applyAnonymousSessionEviction(prisma as never, userId);
          appendSetCookie(res, clearAuthCookies());
          log.security(
            "AUTH_USERSCRIPT_MANAGER_KICKED",
            { userId, managers, eventType, ip },
            req,
          );
        } catch (err) {
          log.warn("userscript_manager_kick_failed", {
            err: err instanceof Error ? err.message : String(err),
            userId,
          });
        }
        res.json({
          ok: true,
          kick: true,
          code: "USERSCRIPT_MANAGER_BLOCKED",
          message: AUTH_LOGIN_MESSAGES.USERSCRIPT_MANAGER_BLOCKED,
          managers,
        });
        return;
      }
    }

    res.json({ ok: true });
  } catch (err) {
    log.warn("telemetry_error", { err: err instanceof Error ? err.message : String(err) });
    res.json({ ok: true });
  }
}

export async function adminOverview(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminAntibotOverviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
      return;
    }
    const data = await getAntibotAdminOverview(prisma, parsed.data.limit);
    res.json({
      ok: true,
      topRisk: data.topRisk,
      openAlerts: data.openAlerts,
      recentAlerts: data.recentAlerts,
      totals: {
        profiles: data.totals._count._all,
        maxRisk: data.totals._max.riskScore ?? 0,
        avgRisk: Math.round(Number(data.totals._avg.riskScore ?? 0) * 10) / 10,
      },
    });
  } catch (err) {
    log.error("overview_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to load antibot overview." });
  }
}

export async function adminListEvidence(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminAntibotListEvidenceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
      return;
    }
    const { page, limit, userId, detector, code, severity } = parsed.data;
    const { items, total } = await listAntibotEvidence(prisma, { userId, detector, code, severity }, page, limit);
    res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    log.error("list_evidence_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to load antibot evidence." });
  }
}

export async function adminListSessions(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminAntibotListSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
      return;
    }
    const { page, limit, userId, deviceId, ip } = parsed.data;
    const { items, total } = await listAntibotSessions(prisma, { userId, deviceId, ip }, page, limit);
    res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    log.error("list_sessions_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to load antibot sessions." });
  }
}

export async function adminListDevices(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminAntibotListDevicesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
      return;
    }
    const { page, limit, minAccounts } = parsed.data;
    const { items, total } = await listAntibotDevices(prisma, minAccounts, page, limit);
    res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    log.error("list_devices_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to load antibot devices." });
  }
}

export async function adminListAlerts(req: Request, res: Response): Promise<void> {
  try {
    const parsed = adminAntibotListAlertsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
      return;
    }
    const { page, limit, status, severity } = parsed.data;
    const { items, total } = await listAntibotAlerts(prisma, { status, severity }, page, limit);
    res.json({ ok: true, items, total, page, limit });
  } catch (err) {
    log.error("list_alerts_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to load antibot alerts." });
  }
}

export async function adminUpdateAlert(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = antibotIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id } = paramParsed.data;

    const bodyParsed = adminUpdateAlertSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }
    const { status } = bodyParsed.data;

    const updated = await updateAntibotAlert(prisma, id, status);
    if (!updated) {
      res.status(404).json({ ok: false, code: "not_found", message: "Alert not found" });
      return;
    }

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ANTIBOT_UPDATE_ALERT",
      module: "antibot",
      resource: "antibot_alert",
      resourceId: String(id),
      newValue: { status },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({ ok: true, alert: updated });
  } catch (err) {
    log.error("update_alert_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to update antibot alert." });
  }
}

export async function adminSetTrusted(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = antibotUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const bodyParsed = adminSetTrustedSchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
      return;
    }
    const { trusted, reason } = bodyParsed.data;

    await setAntibotUserTrusted(prisma, userId, trusted, reason ?? null);

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: trusted ? "ANTIBOT_TRUST_USER" : "ANTIBOT_UNTRUST_USER",
      module: "antibot",
      resource: "antibot_profile",
      resourceId: String(userId),
      newValue: { trusted, reason },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({ ok: true, userId, trusted });
  } catch (err) {
    log.error("set_trusted_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to update trust status." });
  }
}

export async function adminRecompute(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = antibotUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const result = await recomputeAntibotUserScore(prisma, userId);

    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ANTIBOT_RECOMPUTE_SCORE",
      module: "antibot",
      resource: "antibot_profile",
      resourceId: String(userId),
      newValue: result,
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });

    res.json({ ok: true, userId, ...result });
  } catch (err) {
    log.error("recompute_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to recompute antibot score." });
  }
}

export async function adminUserProfile(req: Request, res: Response): Promise<void> {
  try {
    const paramParsed = antibotUserIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
      return;
    }
    const { id: userId } = paramParsed.data;

    const queryParsed = adminUserProfileQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      res.status(400).json({ ok: false, code: "validation_error", errors: queryParsed.error.issues });
      return;
    }
    const { evidenceLimit } = queryParsed.data;

    const data = await getAntibotUserProfile(prisma, userId, evidenceLimit);
    if (!data) {
      res.status(404).json({ ok: false, code: "not_found", message: "User not found" });
      return;
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    log.error("user_profile_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to load antibot user profile." });
  }
}

export async function adminClearAntibot(req: Request, res: Response): Promise<void> {
  try {
    const evidenceDeleted = await resetAntibot(prisma);
    void logAdminAction({
      adminId: adminActorId(req),
      adminEmail: req.admin?.email ?? null,
      sessionId: req.admin?.sessionId ?? null,
      action: "ANTIBOT_CLEAR_ALL",
      module: "antibot",
      resource: "antibot_all",
      resourceId: "all",
      newValue: { evidenceDeleted },
      ipAddress: getClientIp(req),
      userAgent: readUserAgent(req),
    });
    res.json({ ok: true, evidenceDeleted });
  } catch (err) {
    log.error("reset_failed", { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Unable to reset antibot data." });
  }
}

export { sanitizeTelemetry, bandForScore };

