/**
 * Structured logger — core infrastructure, zero business rules.
 * Ported/condensed from legacy/server/utils/logger.ts: JSON lines to stdout,
 * per-category children, dedicated SECURITY level (same priority as ERROR so
 * `LOG_LEVEL=error` still records security events).
 */
import type { Request } from "express";

export type LogLevel = "ERROR" | "SECURITY" | "WARN" | "INFO" | "DEBUG";

/** Lower weight = more severe. SECURITY shares ERROR weight so it is never filtered by `error`. */
export const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  ERROR: 0,
  SECURITY: 0,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

export const DEFAULT_LOG_LEVEL: LogLevel = "INFO";

export function parseLogLevel(raw: string | undefined | null): LogLevel {
  const normalized = String(raw ?? DEFAULT_LOG_LEVEL).trim().toUpperCase();
  if (normalized in LOG_LEVEL_WEIGHT) return normalized as LogLevel;
  return DEFAULT_LOG_LEVEL;
}

export function parseLogLevelThreshold(raw?: string | null): number {
  return LOG_LEVEL_WEIGHT[parseLogLevel(raw)];
}

export function isLogLevelAllowed(level: LogLevel, threshold: number): boolean {
  return LOG_LEVEL_WEIGHT[level] <= threshold;
}

export function normalizeLogDetails(details: unknown): Record<string, unknown> {
  if (details == null) return {};
  if (typeof details !== "object" || Array.isArray(details)) return { value: details };
  return { ...(details as Record<string, unknown>) };
}

export function requestContextFromReq(req: Request | null | undefined): Record<string, unknown> {
  if (!req || typeof req !== "object") return {};
  const userId = req.user?.id != null ? String(req.user.id) : undefined;
  const requestId =
    (typeof req.headers?.["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined) ??
    undefined;
  return {
    ...(userId ? { userId } : {}),
    ip: req.ip,
    endpoint: String(req.originalUrl || req.url || ""),
    ...(requestId ? { requestId } : {}),
  };
}

export type BuildLogRecordInput = {
  level: LogLevel;
  message: string;
  category: string;
  details?: unknown;
  req?: Request | null;
  now?: Date;
};

export function buildLogRecord(input: BuildLogRecordInput): Record<string, unknown> {
  const details = normalizeLogDetails(input.details);
  return {
    level: input.level.toLowerCase(),
    message: input.message,
    category: input.category,
    timestamp: (input.now ?? new Date()).toISOString(),
    ...requestContextFromReq(input.req),
    ...(Object.keys(details).length ? { details } : {}),
  };
}

function writeLine(record: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return;
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(record));
}

export class Logger {
  private readonly category: string;
  private readonly threshold: number;

  constructor(category = "App", threshold = parseLogLevelThreshold(process.env.LOG_LEVEL)) {
    this.category = category;
    this.threshold = threshold;
  }

  child(category: string): Logger {
    return new Logger(`${this.category}:${category}`, this.threshold);
  }

  private emit(
    level: LogLevel,
    message: string,
    details: Record<string, unknown> = {},
    req?: Request | null,
  ): void {
    if (!isLogLevelAllowed(level, this.threshold)) return;
    writeLine(
      buildLogRecord({
        level,
        message,
        category: this.category,
        details,
        req,
      }),
    );
  }

  error(message: string, details?: Record<string, unknown>, req?: Request | null): void {
    this.emit("ERROR", message, details, req);
  }

  security(message: string, details?: Record<string, unknown>, req?: Request | null): void {
    this.emit("SECURITY", message, details, req);
  }

  warn(message: string, details?: Record<string, unknown>, req?: Request | null): void {
    this.emit("WARN", message, details, req);
  }

  info(message: string, details?: Record<string, unknown>, req?: Request | null): void {
    this.emit("INFO", message, details, req);
  }

  debug(message: string, details?: Record<string, unknown>, req?: Request | null): void {
    this.emit("DEBUG", message, details, req);
  }
}

const rootLogger = new Logger("App");

export default rootLogger;
