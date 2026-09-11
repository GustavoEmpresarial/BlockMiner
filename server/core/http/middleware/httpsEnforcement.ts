/** Ported from legacy/server/middleware/httpsEnforcement.ts verbatim (no behavior change). */
import type { NextFunction, Request, RequestHandler, Response } from "express";

function readForwardedProto(req: Request): string {
  const raw = req.headers["x-forwarded-proto"];
  if (!raw) return "";
  return String(Array.isArray(raw) ? raw[0] : raw)
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  return readForwardedProto(req) === "https";
}

function hstsMaxAge(): number {
  const n = Number(process.env.HSTS_MAX_AGE_SECONDS ?? 31536000);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 31536000;
}

export function createHttpsEnforcementMiddleware(): RequestHandler {
  return function httpsEnforcement(req: Request, res: Response, next: NextFunction): void {
    const enabled =
      process.env.NODE_ENV === "production" && String(process.env.FORCE_HTTPS ?? "1").trim() !== "0";
    if (!enabled) {
      next();
      return;
    }

    // Docker's HEALTHCHECK hits this container's own loopback (127.0.0.1:3000/health) directly,
    // never through nginx/Cloudflare — it can never carry a real X-Forwarded-Proto, so it would
    // otherwise get redirected forever and the container would report unhealthy despite actually
    // serving traffic fine. /health returns no sensitive data, so exempting it costs nothing.
    // Bug found by actually booting docker-compose.yml end-to-end, not present in legacy's port
    // (same missing exemption there — never caught because an "unhealthy" compose status doesn't
    // stop a container by itself, so it likely went unnoticed in production too).
    if (req.path === "/health") {
      next();
      return;
    }

    if (isSecureRequest(req)) {
      const include = String(process.env.HSTS_INCLUDE_SUBDOMAINS ?? "1").trim() === "1";
      const preload = String(process.env.HSTS_PRELOAD ?? "0").trim() === "1";
      let hsts = `max-age=${hstsMaxAge()}`;
      if (include) hsts += "; includeSubDomains";
      if (preload) hsts += "; preload";
      res.setHeader("Strict-Transport-Security", hsts);
      next();
      return;
    }

    const host = req.headers.host || "";
    if ((req.method === "GET" || req.method === "HEAD") && host) {
      res.redirect(301, `https://${host}${req.originalUrl || ""}`);
      return;
    }

    res.status(403).json({
      ok: false,
      code: "HTTPS_REQUIRED",
      messageKey: "errors.security.HTTPS_REQUIRED",
      message: "HTTPS is required for this request.",
    });
  };
}
