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

/**
 * Blast radius, deliberately separate from severity: a failed search is
 * severity ERROR / impact LOW, while a tournament paying nobody is severity
 * ERROR / impact CRITICAL. Filtering on severity alone cannot tell them apart.
 */
export type ErrorImpact = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ReportErrorInput = {
  /** Stable machine code, e.g. "SATSPAY_TOKEN_EXCHANGE_FAILED" — never a free-text message. */
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  /** Defaults to MEDIUM when the caller does not say. */
  impact?: ErrorImpact;
  /** Module/feature this occurred in, e.g. "auth.login", "public-stats". Used in the fingerprint. */
  module: string;
  /** The specific operation inside the module, e.g. "finalizeTournament". */
  operation?: string;
  /** The original error/exception, if any — message + stack are extracted and redacted. */
  error?: unknown;
  /** Free-form extra context (userId, path, provider, etc.) — redacted before logging. */
  context?: Record<string, unknown>;
  req?: Request;
};

/** Field names that must never reach a log line, regardless of where they appear in context. */
const SECRET_KEY_RE =
  /password|passwordhash|secret|token|refreshtoken|accesstoken|authorization|cookie|api[_-]?key|private[_-]?key|privkey|seed|mnemonic|2fa|otp|pin|cvv|card|credential|signature|session[_-]?id/i;

/**
 * Secret shapes that arrive as a VALUE under an innocent-looking key — a JWT inside
 * a callback URL, a raw Authorization header copied into context, a PEM block.
 * Deliberately narrow: blockchain tx hashes and addresses are legitimate context
 * (see the Web3 error-collection requirements) and must survive redaction.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i, // not anchored: upstream messages embed it mid-string
  /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/, // JWT, anywhere in the string
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/, // stripe-style secret keys
];

/** Depth cap: bounds work per report and stops a pathological object from stalling the logger. */
const MAX_REDACT_DEPTH = 6;
/** Long strings are log-flooding fuel; keep enough to debug, drop the rest. */
const MAX_STRING_LEN = 512;

function redactString(value: string): string {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(value)) return "[REDACTED]";
  }
  return value.length > MAX_STRING_LEN
    ? `${value.slice(0, MAX_STRING_LEN)}…[truncated ${value.length - MAX_STRING_LEN} chars]`
    : value;
}

function redactUnknown(key: string, value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (SECRET_KEY_RE.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value);
  if (!value || typeof value !== "object") return value;

  if (depth >= MAX_REDACT_DEPTH) return "[TRUNCATED]";

  // Circular graphs would otherwise recurse until the stack blows and the whole
  // report is silently lost inside reportError's catch.
  if (seen.has(value as object)) return "[CIRCULAR]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    // Arrays used to pass through untouched, so a secret nested one level inside
    // an array — [{ password }] — reached the log line in clear text.
    return value.map((item) => redactUnknown(key, item, depth + 1, seen));
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };

  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    out[childKey] = redactUnknown(childKey, childValue, depth + 1, seen);
  }
  return out;
}

/**
 * Strips anything secret-shaped out of a context object before it is logged —
 * by key name, by value shape, at any nesting depth, inside arrays, and safely
 * across circular references.
 */
export function redactContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  const seen = new WeakSet<object>();
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactUnknown(key, value, 0, seen);
  }
  return out;
}

/**
 * Unique per OCCURRENCE — the opposite axis from `fingerprint`, which is shared by
 * every occurrence of the same problem. This is the id a player can be told to
 * quote ("send us the error code") so support can find that exact event.
 * Time-prefixed so ids sort chronologically in a log search.
 */
export function newErrorId(now: Date = new Date()): string {
  return `err_${now.getTime().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
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
export function reportError(
  input: ReportErrorInput,
): { errorId: string; fingerprint: string; requestId?: string } {
  const fingerprint = fingerprintError(input);
  const errorId = newErrorId();
  const reqId = requestId(input.req);
  try {
    const { message, stack, name } = extractErrorDetails(input.error);
    const method = SEVERITY_TO_LOG_METHOD[input.severity];
    log[method](input.code, {
      error_id: errorId,
      severity: input.severity,
      impact: input.impact ?? "MEDIUM",
      category: input.category,
      module: input.module,
      operation: input.operation,
      fingerprint,
      request_id: reqId,
      error_name: name,
      error_message: redactString(message),
      // Stack traces stay out of INFO/DEBUG noise but are always kept for ERROR+ so an
      // occurrence can be traced back to a line without re-running to reproduce it.
      stack: input.severity === "ERROR" || input.severity === "CRITICAL" ? stack : undefined,
      context: redactContext(input.context),
    });
  } catch {
    // Reporting itself must be best-effort — a logger hiccup must never bubble into the
    // original request's error path.
  }
  return { errorId, fingerprint, requestId: reqId };
}
