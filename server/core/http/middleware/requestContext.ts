/**
 * Ported from legacy/server/middleware/requestContext.ts.
 * Ensures every HTTP request has correlation + request IDs for structured logs.
 */
import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getRequestIp } from "../../../shared/http/clientIp.js";

declare global {
  namespace Express {
    interface Request {
      auditContext?: {
        correlationId: string;
        requestIp: string;
        ipHash: string;
        userAgent: string | null;
      };
    }
  }
}

function generateCorrelationId(): string {
  return crypto.randomUUID();
}

function hashIp(ip: unknown): string {
  const normalized = String(ip || "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function buildAuditContextFromRequest(req: Request): {
  correlationId: string;
  requestIp: string;
  ipHash: string;
  userAgent: string | null;
} {
  const requestIp = getRequestIp(req);
  const incoming = req.headers["x-correlation-id"];
  return {
    correlationId: typeof incoming === "string" && incoming ? incoming : generateCorrelationId(),
    requestIp,
    ipHash: hashIp(requestIp),
    userAgent: (req.headers["user-agent"] as string) || null,
  };
}

export function createRequestContextMiddleware(): RequestHandler {
  return function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.auditContext) {
      req.auditContext = buildAuditContextFromRequest(req);
    }
    const ctx = req.auditContext;
    const incomingRequestId =
      typeof req.headers["x-request-id"] === "string" ? (req.headers["x-request-id"] as string).trim() : "";
    const requestId = incomingRequestId || ctx.correlationId;
    req.headers["x-request-id"] = requestId;
    if (!res.getHeader("X-Request-Id")) res.setHeader("X-Request-Id", requestId);
    if (!res.getHeader("X-Correlation-Id")) res.setHeader("X-Correlation-Id", ctx.correlationId);
    next();
  };
}
