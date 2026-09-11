/**
 * Ported from legacy/server/middleware/userActivityAudit.ts.
 * Pure gates: userActivityAudit.policy.ts
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import prisma from "../../database/prisma.js";
import { logger } from "../../logger/index.js";
import {
  buildUserApiActivityAction,
  normalizeUserActivityPath,
  shouldAuditUserRequest,
  type UserActivityAuditOptions,
} from "./userActivityAudit.policy.js";

export {
  buildUserApiActivityAction,
  shouldAuditUserRequest,
  type UserActivityAuditOptions,
} from "./userActivityAudit.policy.js";

const log = logger.child("UserActivity");

/** Best-effort structured log + AuditLog row. Never throws — an audit failure must not break the request. */
function logUserActivity(activityType: string, req: Request, details: Record<string, unknown>): void {
  log.info(activityType, details, req);

  if (process.env.NODE_ENV === "test") return;
  if (String(activityType).startsWith("AUTH_") && activityType !== "AUTH_LOCKOUT_DENIED") return;

  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return;
  const ip = req.ip || null;
  const userAgent = (req.headers["user-agent"] as string) || null;

  prisma.auditLog
    .create({
      data: {
        userId,
        action: activityType,
        source: "user",
        severity: "info",
        ip,
        userAgent,
        detailsJson: JSON.stringify(details),
      },
    })
    .catch(() => undefined);
}

export function createUserActivityAuditMiddleware(options: UserActivityAuditOptions = {}): RequestHandler {
  return function userActivityAuditMiddleware(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    res.on("finish", () => {
      if (!shouldAuditUserRequest(req, res, options)) return;
      const path = normalizeUserActivityPath(req.originalUrl || req.url || "");
      logUserActivity(buildUserApiActivityAction(req.method, path), req, {
        method: String(req.method || "GET").toUpperCase(),
        path,
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    });
    next();
  };
}
