/**
 * Structured error reporting — collection + classification + fingerprinting layer, scoped
 * (per user request) to the surfaces just rewritten this session: landing/public-stats,
 * login, register, and auth 2.0 (Google/SatsPay). Not a project-wide observability rewrite —
 * a small, reusable piece any module's catch block can call instead of a bare `log.error`.
 *
 * On top of the existing `logger` (server/core/logger) this adds:
 *  - a small closed set of severities/categories (see ErrorSeverity/ErrorCategory) so errors
 *    can be filtered/aggregated later without parsing free-text messages;
 *  - a stable `code` (already used ad-hoc across controllers as e.g. "SATSPAY_DISABLED") now
 *    carried alongside severity/category on every report;
 *  - a `fingerprint` (code + category + module, hashed short) so repeated occurrences of the
 *    same failure can be grouped even before a real error-tracking backend exists;
 *  - `request_id` correlation (reads the X-Request-Id set by requestContext middleware) so a
 *    single error report can be traced back to one HTTP request in the access logs;
 *  - redaction of anything that looks like a secret before it ever reaches a log line.
 */
import crypto from "node:crypto";
import type { Request } from "express";
import { logger } from "../logger/index.js";

const log = logger.child("ErrorReporter");

export type ErrorSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ErrorCategory =
  | "CLIENT"
  | "AUTH"
  | "DATABASE"
  | "EXTERNAL_API"
  | "BUSINESS"
  | "INFRASTRUCTURE"
  | "SECURITY"
  | "UNKNOWN";

export type ReportErrorInput = {
  /** Stable machine code, e.g. "SATSPAY_TOKEN_EXCHANGE_FAILED" — never a free-text message. */
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  /** Module/feature this occurred in, e.g. "auth.login", "public-stats". Used in the fingerprint. */
  module: string;
  /** The original error/exception, if any — message + stack are extracted and redacted. */
  error?: unknown;
  /** Free-form extra context (userId, path, provider, etc.) — redacted before logging. */
  context?: Record<string, unknown>;
  req?: Request;
};

/** Field names that must never reach a log line, regardless of where they appear in context. */
const SECRET_KEY_RE =
  /password|passwordhash|secret|token|refreshtoken|accesstoken|authorization|cookie|api[_-]?key|private[_-]?key|seed|2fa|cvv|card/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_RE.test(key)) return "[REDACTED]";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactContext(value as Record<string, unknown>);
  }
  return value;
}

export function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

/** Short, stable grouping key so N occurrences of the same failure read as one problem. */
export function fingerprintError(input: Pick<ReportErrorInput, "code" | "category" | "module">): string {
  const hash = crypto
    .createHash("sha1")
    .update(`${input.module}:${input.category}:${input.code}`)
    .digest("hex")
    .slice(0, 10);
  return `fp_${hash}`;
}

function requestId(req?: Request): string | undefined {
  if (!req) return undefined;
  const header = req.headers?.["x-request-id"];
  if (typeof header === "string" && header) return header;
  const fromRes = (req.res?.getHeader?.("X-Request-Id") ?? undefined) as string | undefined;
  return typeof fromRes === "string" ? fromRes : undefined;
}

function extractErrorDetails(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, name: error.name };
  }
  return { message: String(error ?? "unknown error") };
}

const SEVERITY_TO_LOG_METHOD: Record<ErrorSeverity, "error" | "warn" | "info" | "debug"> = {
  CRITICAL: "error",
  ERROR: "error",
  WARNING: "warn",
  INFO: "info",
  DEBUG: "debug",
};

/**
 * Central entry point — call this from a catch block instead of `log.error(...)` directly.
 * Never throws; a failure to report must never mask or replace the original error.
 */
export function reportError(input: ReportErrorInput): { fingerprint: string; requestId?: string } {
  const fingerprint = fingerprintError(input);
  const reqId = requestId(input.req);
  try {
    const { message, stack, name } = extractErrorDetails(input.error);
    const method = SEVERITY_TO_LOG_METHOD[input.severity];
    log[method](input.code, {
      severity: input.severity,
      category: input.category,
      module: input.module,
      fingerprint,
      request_id: reqId,
      error_name: name,
      error_message: message,
      // Stack traces stay out of INFO/DEBUG noise but are always kept for ERROR+ so an
      // occurrence can be traced back to a line without re-running to reproduce it.
      stack: input.severity === "ERROR" || input.severity === "CRITICAL" ? stack : undefined,
      context: redactContext(input.context),
    });
  } catch {
    // Reporting itself must be best-effort — a logger hiccup must never bubble into the
    // original request's error path.
  }
  return { fingerprint, requestId: reqId };
}
