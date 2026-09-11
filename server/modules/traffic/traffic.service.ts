/** Ported from legacy/server/modules/traffic/traffic.routes.ts (inline logic → service). */
import { logger } from "../../core/logger/index.js";
import { shouldDropClientError } from "./traffic.errors.js";

export { shouldDropClientError };
import {
  clearClientErrors,
  createClientErrorLog,
  getTrafficByDomain,
  getTrafficByUtm,
  getTrafficDaily,
  getTrafficSummary,
  listClientErrors,
  recordPageView,
} from "./traffic.repository.js";
import type { ClientErrorBody, HitBody } from "./traffic.schemas.js";
import type { ClientErrorListItem, TrafficByDomainRow, TrafficByUtmRow, TrafficDailyRow, TrafficSummary } from "./traffic.types.js";

const log = logger.child("traffic.service");

export async function recordHit(body: HitBody): Promise<void> {
  try {
    await recordPageView(body);
  } catch {
    /* best-effort: a tracking hit must never surface an error to the client */
  }
}

export type ReportClientErrorArgs = {
  body: ClientErrorBody;
  userAgent: string | null;
  ip: string;
  userId: number | null;
};

export type ReportClientErrorResult = { dropped: boolean };

/**
 * Applies the noise/expected-UX filter, logs the surviving reports structurally
 * (visible in docker logs even if the DB write fails), then best-effort persists to
 * AuditLog. Never throws — a broken error reporter must never itself error out.
 */
export async function reportClientError(args: ReportClientErrorArgs): Promise<ReportClientErrorResult> {
  const { body, userAgent, ip, userId } = args;
  const { message, stack, componentStack, url, category, statusCode, buildId, code, operation, requestId } = body;
  const action = category === "api_failure" ? "client_api_failure" : "client_error_report";

  if (shouldDropClientError(body, userAgent)) {
    return { dropped: true };
  }

  log.error(`[${action}]`, {
    category,
    message,
    statusCode,
    code,
    operation,
    url,
    requestId,
    userId,
    userAgent,
    ip,
    buildId,
    stackPreview: typeof stack === "string" ? stack.slice(0, 400) : null,
  });

  try {
    await createClientErrorLog({
      message,
      stack,
      componentStack,
      url,
      userAgent,
      category,
      statusCode,
      buildId,
      code,
      operation,
      requestId,
      ip,
      userId,
    });
  } catch {
    /* never fail an error report over a DB write */
  }

  return { dropped: false };
}

export async function getSummary(days: number): Promise<TrafficSummary> {
  return getTrafficSummary(days);
}

export async function getByDomain(days: number): Promise<TrafficByDomainRow[]> {
  return getTrafficByDomain(days);
}

export async function getByUtm(days: number): Promise<TrafficByUtmRow[]> {
  return getTrafficByUtm(days);
}

export async function getDaily(days: number): Promise<TrafficDailyRow[]> {
  return getTrafficDaily(days);
}

export function clampDays(raw: unknown): number {
  const days = Math.min(parseInt(String(raw ?? "30"), 10) || 30, 365);
  return days;
}

export async function listClientErrorReports(limit: number): Promise<ClientErrorListItem[]> {
  return listClientErrors(limit);
}

export async function clearClientErrorReports(): Promise<number> {
  return clearClientErrors();
}
