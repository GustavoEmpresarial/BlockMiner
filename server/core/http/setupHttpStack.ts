/**
 * Core HTTP stack: HTTPS enforcement, helmet (CSP disabled — applied separately per
 * route group by createCspMiddleware), CORS, cookies, JSON body parsing, CSRF,
 * request-id/correlation context, structured request logging, and best-effort
 * user-activity audit trail.
 */
import crypto from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createCsrfMiddleware } from "./middleware/csrf.js";
import { createCspMiddleware } from "./middleware/csp.js";
import { createHttpsEnforcementMiddleware } from "./middleware/httpsEnforcement.js";
import { createRequestContextMiddleware } from "./middleware/requestContext.js";
import { createHttpRequestLogger } from "./middleware/httpRequestLogger.js";
import { createUserActivityAuditMiddleware } from "./middleware/userActivityAudit.js";
import {
  buildExpressCorsOptions,
  assertProductionCorsConfigured,
} from "../../shared/http/corsConfig.js";
import { createPartnerEmbedHeadersMiddleware } from "../../shared/http/partnerEmbedHeaders.js";
import { resolveTrustProxy } from "./trustProxy.js";

export { resolveTrustProxy } from "./trustProxy.js";

/** JSON / urlencoded body size — product default; override via BODY_PARSER_LIMIT. */
const DEFAULT_BODY_PARSER_LIMIT = "2mb";

function readBodyParserLimit(): string {
  const raw = String(process.env.BODY_PARSER_LIMIT ?? "").trim();
  return raw || DEFAULT_BODY_PARSER_LIMIT;
}

export function setupHttpStack(app: Express): void {
  app.set("trust proxy", resolveTrustProxy());
  // Per-request financial/session APIs are not cacheable static assets — disable ETag
  // so Axios polling does not treat 304 as failure (see wallet balance card incident).
  app.set("etag", false);

  app.use(createHttpsEnforcementMiddleware());

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64url");
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
    }),
  );
  app.use(createPartnerEmbedHeadersMiddleware());
  app.use(createCspMiddleware());
  assertProductionCorsConfigured();
  app.use(cors(buildExpressCorsOptions()));
  app.use(cookieParser());

  const bodyLimit = readBodyParserLimit();
  app.use(
    express.json({
      limit: bodyLimit,
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
  app.use(createCsrfMiddleware());
  app.use(createRequestContextMiddleware());
  app.use(createHttpRequestLogger());
  app.use(createUserActivityAuditMiddleware());
}
