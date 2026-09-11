/**
 * Pure policy for user-activity audit (no Prisma / IO).
 * Middleware lives in userActivityAudit.ts.
 */
import type { Request, Response } from "express";

export const DEFAULT_USER_ACTIVITY_IGNORED_PREFIXES = ["/api/admin"];
export const DEFAULT_USER_ACTIVITY_IGNORED_PATHS = new Set([
  "/api/session/heartbeat",
  "/api/auth/mark-adblock",
]);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function normalizeUserActivityPath(path: string | undefined): string {
  const p = String(path || "")
    .split("?")[0]
    .trim();
  if (!p) return "/";
  return p.replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
}

function sanitizePathSegment(segment: string): string {
  const s = String(segment || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return "ID";
  if (/^[0-9a-f]{16,}$/i.test(s)) return "HASH";
  return s
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function buildUserApiActivityAction(method: string | undefined, path: string | undefined): string {
  const safeMethod =
    String(method || "GET")
      .toUpperCase()
      .replace(/[^A-Z]/g, "") || "GET";
  const normalized = normalizeUserActivityPath(path);
  const parts = normalized
    .replace(/^\/api\/?/, "")
    .split("/")
    .map(sanitizePathSegment)
    .filter(Boolean);
  const suffix = parts.length ? parts.slice(0, 5).join("_") : "ROOT";
  return `USER_API_${safeMethod}_${suffix}`;
}

export type UserActivityAuditOptions = {
  auditReads?: boolean;
  includeServerErrors?: boolean;
  ignoredPaths?: Set<string>;
  ignoredPrefixes?: string[];
};

export function shouldAuditUserRequest(
  req: Request,
  res: Response,
  options: UserActivityAuditOptions = {},
): boolean {
  if (!req?.user?.id) return false;
  const method = String(req.method || "GET").toUpperCase();
  const auditReads = options.auditReads ?? process.env.USER_ACTIVITY_LOG_READS !== "0";
  if (!auditReads && !MUTATING_METHODS.has(method)) return false;

  const status = Number(res?.statusCode || 0);
  if (status >= 500 && options.includeServerErrors !== true) return false;

  const path = normalizeUserActivityPath(req.originalUrl || req.url || "");
  const ignoredPaths = options.ignoredPaths || DEFAULT_USER_ACTIVITY_IGNORED_PATHS;
  if (ignoredPaths.has(path)) return false;

  const ignoredPrefixes = options.ignoredPrefixes || DEFAULT_USER_ACTIVITY_IGNORED_PREFIXES;
  if (ignoredPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;

  return true;
}
