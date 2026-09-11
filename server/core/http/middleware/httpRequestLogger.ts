/**
 * Structured access log for every HTTP response.
 * Slow / 5xx requests escalate to WARN using HTTP_SLOW_REQUEST_MS (env), not a hard-coded guess.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../../logger/index.js";

const log = logger.child("HttpRequest");

/** Product default: match prior stack behavior (1s). Override with HTTP_SLOW_REQUEST_MS. */
export const DEFAULT_HTTP_SLOW_REQUEST_MS = 1_000;

export function readHttpSlowRequestMs(
  raw: string | undefined | null = process.env.HTTP_SLOW_REQUEST_MS,
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_HTTP_SLOW_REQUEST_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_HTTP_SLOW_REQUEST_MS;
  return n;
}

export function shouldLogHttpRequestAsSlow(opts: {
  durationMs: number;
  statusCode: number;
  slowRequestMs: number;
}): boolean {
  return opts.durationMs >= opts.slowRequestMs || opts.statusCode >= 500;
}

export function createHttpRequestLogger(
  slowRequestMs = readHttpSlowRequestMs(),
): RequestHandler {
  return function httpRequestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      const roundedMs = Math.round(durationMs * 1000) / 1000;
      const details = {
        method: req.method,
        route: req.route?.path || req.path,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: roundedMs,
      };
      if (
        shouldLogHttpRequestAsSlow({
          durationMs: roundedMs,
          statusCode: res.statusCode,
          slowRequestMs,
        })
      ) {
        log.warn("http_request_slow", details, req);
      } else {
        log.info("http_request", details, req);
      }
    });
    next();
  };
}
