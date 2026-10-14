/**
 * Origin lock: when ORIGIN_AUTH_SECRET is set, only requests carrying the matching
 * X-Origin-Auth header are served. Cloudflare adds that header (Transform Rule), so traffic
 * that reaches the origin directly — bypassing Cloudflare and free to forge CF-Connecting-IP —
 * is refused before any route runs. Unset secret = disabled (dev, staged rollout).
 */
import crypto from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logger } from "../../logger/index.js";

const log = logger.child("http.originAuth");

export const ORIGIN_AUTH_HEADER = "x-origin-auth";

/** Container healthcheck hits loopback directly and can never carry the Cloudflare header. */
const EXEMPT_PATHS = new Set(["/health", "/health/ready"]);

function readSecret(): string {
  return String(process.env.ORIGIN_AUTH_SECRET ?? "").trim();
}

function matches(provided: string, secret: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readHeader(headers: IncomingHttpHeaders): string {
  const raw = headers[ORIGIN_AUTH_HEADER];
  return String(Array.isArray(raw) ? raw[0] : (raw ?? "")).trim();
}

/** Same check for transports that bypass Express (Socket.IO handshake). */
export function isOriginRequestAllowed(headers: IncomingHttpHeaders): boolean {
  const secret = readSecret();
  if (!secret) return true;
  const provided = readHeader(headers);
  return Boolean(provided) && matches(provided, secret);
}

export function createOriginAuthMiddleware(): RequestHandler {
  return function originAuth(req: Request, res: Response, next: NextFunction): void {
    const secret = readSecret();
    if (!secret) {
      next();
      return;
    }
    const provided = readHeader(req.headers);
    // Never let the shared secret reach request logs / audit trails downstream.
    delete req.headers[ORIGIN_AUTH_HEADER];

    if (EXEMPT_PATHS.has(req.path) || (provided && matches(provided, secret))) {
      next();
      return;
    }
    log.warn("origin_auth.rejected", {
      path: req.path,
      method: req.method,
      remoteAddress: req.socket?.remoteAddress ?? null,
      hadHeader: Boolean(provided),
    });
    res.status(403).json({ ok: false, code: "ORIGIN_FORBIDDEN", message: "Forbidden." });
  };
}
