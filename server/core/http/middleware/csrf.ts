import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { logSecurityEvent } from "../../../shared/security/securityLogger.js";
import { authDebug, authLoginTrace } from "../../../shared/security/authDebug.js";

export const CSRF_COOKIE_NAME = "blockminer_csrf";

function parseCookie(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) return {};
  return headerValue.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function sameSiteMode(): "lax" | "strict" | "none" {
  const raw = String(process.env.CSRF_COOKIE_SAMESITE || "").trim().toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") return raw;
  return process.env.NODE_ENV === "production" ? "strict" : "lax";
}

export function buildCsrfCookie(token: string): string {
  const sameSite = sameSiteMode();
  const parts = [`${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`, "Path=/", `SameSite=${sameSite}`];
  if (process.env.NODE_ENV === "production" || sameSite === "none") parts.push("Secure");
  if (sameSite === "none") parts.push("Partitioned");
  return parts.join("; ");
}

function appendSetCookie(res: Response, cookieValue: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const cookies = Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader("Set-Cookie", [...cookies, cookieValue]);
}

export function rotateCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(24).toString("base64url");
  appendSetCookie(res, buildCsrfCookie(token));
  res.locals.csrfToken = token;
  return token;
}

/** Best-effort/S2S paths that never carry a browser CSRF token — extend per module as needed.
 *  Matches legacy S2S_PATHS + /api/track/, plus MoneyRain callback (POST S2S HMAC — legacy
 *  mounted it on the public surface but forgot to list it; without this exemption providers
 *  cannot deliver postbacks). */
const CSRF_EXEMPT_PREFIXES = [
  "/api/track/",
  "/api/antibot/telemetry",
  "/zeradsptc.php",
  "/api/offerwallme/postback",
  "/api/moneyrain/callback",
  "/api/multiwall/postback",
  "/api/offerwallgg/postback",
];

export function createCsrfMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookie(req.headers.cookie);

    let csrfToken = cookies[CSRF_COOKIE_NAME];
    if (!csrfToken || csrfToken.length < 16) {
      csrfToken = crypto.randomBytes(24).toString("base64url");
      appendSetCookie(res, buildCsrfCookie(csrfToken));
    }
    res.locals.csrfToken = csrfToken;

    const method = req.method.toUpperCase();
    const url = req.originalUrl || req.url;

    if (url.includes("/socket.io/")) {
      next();
      return;
    }
    if (CSRF_EXEMPT_PREFIXES.some((p) => url.startsWith(p))) {
      next();
      return;
    }

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const headerToken = req.headers["x-csrf-token"];
      const headerStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;

      if (!headerStr || headerStr !== csrfToken) {
        logSecurityEvent("INVALID_CSRF_TOKEN", { method, path: url, hasHeader: Boolean(headerStr) }, req);
        authDebug("CSRF_REJECT", req, { reason: "INVALID_CSRF_TOKEN", hasHeader: Boolean(headerStr), path: url });
        authLoginTrace("AUTH_CSRF_REJECT", req, {
          reason: "INVALID_CSRF_TOKEN",
          hasHeader: Boolean(headerStr),
          path: url,
          httpStatus: 403,
        });
        res.status(403).json({
          ok: false,
          code: "INVALID_CSRF_TOKEN",
          message: "This action was blocked for security (CSRF). Please reload the page and try again.",
          csrfToken: csrfToken,
        });
        return;
      }
    }

    next();
  };
}
