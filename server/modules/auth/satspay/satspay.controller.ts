/**
 * SatsPay OAuth controllers — config (public) + code exchange → BlockMiner session.
 */
import type { Request, Response } from "express";
import { logger } from "../../../core/logger/index.js";
import { unknownErrorMessage, respondAuthPrismaError } from "../../../shared/errors/prismaHttpErrors.js";
import { checkBanOrExpire, bannedResponseBody } from "../../../shared/security/authUser.js";
import { AUTH_LOGIN_MESSAGES, buildAuthFailureJson } from "../auth.errors.js";
import { issueAuthSessionForUser } from "../auth.sessionIssue.js";
import { inspectAnonymousLoginIp, loginClientIp } from "../login/login.anonymous-ip.js";
import prisma from "../../../core/database/prisma.js";
import {
  isAllowedSatspayRedirectUri,
  readSatspayOAuthConfig,
  satspayPublicClientConfig,
  SATSPAY_CALLBACK_PATH,
} from "./satspay.config.js";
import { exchangeSatspayAuthorizationCode, fetchSatspayUserInfo } from "./satspay.client.js";
import { resolveOrCreateUserFromSatspay } from "./satspay.service.js";

const log = logger.child("SatspayAuth");

export function satspayConfigGet(req: Request, res: Response): void {
  const host = String(req.get("x-forwarded-host") || req.get("host") || "")
    .split(",")[0]
    ?.trim();
  res.json({ ok: true, satspay: satspayPublicClientConfig(process.env, { requestHost: host }) });
}

function resolveRedirectUri(req: Request, bodyRedirect?: string): string | null {
  const cfg = readSatspayOAuthConfig();
  const fromBody = String(bodyRedirect ?? "").trim();
  if (fromBody && isAllowedSatspayRedirectUri(fromBody)) return fromBody;
  const host = String(req.get("x-forwarded-host") || req.get("host") || "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .split(":")[0];
  if (host) {
    const https = `https://${host}${SATSPAY_CALLBACK_PATH}`;
    if (isAllowedSatspayRedirectUri(https)) return https;
  }
  return cfg.redirectUris[0] ?? null;
}

async function completeSatspayLogin(
  req: Request,
  res: Response,
  args: { code: string; redirectUri: string; codeVerifier: string },
): Promise<"json-ok" | "json-err"> {
  const clientIp = loginClientIp(req);
  const anonymous = await inspectAnonymousLoginIp(prisma, clientIp);
  if (anonymous.blocked) {
    log.security("AUTH_SATSPAY_VPN_PROXY_DENIED", { reason: anonymous.reason }, req);
    res.status(403).json(
      buildAuthFailureJson("VPN_PROXY_BLOCKED", AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED, {
        reason: anonymous.reason,
      }),
    );
    return "json-err";
  }

  const token = await exchangeSatspayAuthorizationCode({
    code: args.code,
    redirectUri: args.redirectUri,
    codeVerifier: args.codeVerifier,
  });
  const info = await fetchSatspayUserInfo({ accessToken: token.access_token });
  const resolved = await resolveOrCreateUserFromSatspay({
    info,
    clientIp,
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  });
  if (!resolved.ok) {
    if (resolved.code === "EMAIL_REQUIRED") {
      res.status(400).json(
        buildAuthFailureJson(
          "SATSPAY_EMAIL_REQUIRED",
          "Sua conta SatsPay precisa de um e-mail verificado para entrar no BlockMiner.",
        ),
      );
      return "json-err";
    }
    res.status(409).json(
      buildAuthFailureJson(
        "SATSPAY_EMAIL_CONFLICT",
        "Este e-mail já está ligado a outra conta SatsPay. Entre com e-mail/senha ou use a conta original.",
      ),
    );
    return "json-err";
  }

  const full = await prisma.user.findUnique({ where: { id: resolved.user.id } });
  if (!full) {
    res.status(500).json(buildAuthFailureJson("INTERNAL_ERROR", AUTH_LOGIN_MESSAGES.INTERNAL));
    return "json-err";
  }
  if (full.isBanned) {
    const ban = await checkBanOrExpire(full.id);
    if (ban.banned) {
      res.status(403).json({
        ...buildAuthFailureJson("ACCOUNT_DISABLED", AUTH_LOGIN_MESSAGES.ACCOUNT_DISABLED),
        ...bannedResponseBody(ban),
      });
      return "json-err";
    }
  }

  const session = await issueAuthSessionForUser({ req, res, user: full });
  log.security(
    "AUTH_SATSPAY_LOGIN_SUCCESS",
    {
      userId: full.id,
      created: resolved.created,
      satspaySubSuffix: info.sub.slice(-8),
    },
    req,
  );
  res.json({ ok: true, created: resolved.created, user: session.user });
  return "json-ok";
}

export async function satspayExchangePost(req: Request, res: Response): Promise<void> {
  try {
    const cfg = readSatspayOAuthConfig();
    if (!cfg.enabled) {
      res.status(503).json(buildAuthFailureJson("SATSPAY_DISABLED", "Login com SatsPay está indisponível no momento."));
      return;
    }
    const code = String(req.body?.code ?? "").trim();
    if (!code) {
      res.status(400).json(buildAuthFailureJson("SATSPAY_CODE_REQUIRED", "Código OAuth ausente."));
      return;
    }
    const codeVerifier = String(req.body?.codeVerifier ?? "").trim();
    if (codeVerifier.length < 43) {
      res.status(400).json(buildAuthFailureJson("SATSPAY_PKCE_REQUIRED", "code_verifier PKCE ausente."));
      return;
    }
    const redirectUri = resolveRedirectUri(req, req.body?.redirectUri);
    if (!redirectUri) {
      res.status(400).json(buildAuthFailureJson("SATSPAY_REDIRECT_INVALID", "redirect_uri não permitido."));
      return;
    }
    await completeSatspayLogin(req, res, { code, redirectUri, codeVerifier });
  } catch (error) {
    if (respondAuthPrismaError(res, error, AUTH_LOGIN_MESSAGES.SERVICE_UNAVAILABLE)) return;
    const code = (error as { code?: string })?.code;
    log.error("auth.satspay.unexpected", { message: unknownErrorMessage(error), code: code ?? null });
    if (code === "SATSPAY_TOKEN_EXCHANGE_FAILED" || code === "SATSPAY_USERINFO_FAILED") {
      res.status(401).json(buildAuthFailureJson(code, "Falha ao validar o login SatsPay. Tente novamente."));
      return;
    }
    res.status(500).json(buildAuthFailureJson("INTERNAL_ERROR", AUTH_LOGIN_MESSAGES.INTERNAL));
  }
}

/**
 * Browser return URL after SatsPay authorize.
 *
 * PKCE verifier lives in sessionStorage on this origin (SDK). Server cannot read it,
 * so we complete the exchange via a same-origin POST from this HTML page.
 */
export async function satspayCallbackGet(req: Request, res: Response): Promise<void> {
  const err = typeof req.query.error === "string" ? req.query.error : "";
  if (err) {
    res.redirect(302, `/login?satspay_error=${encodeURIComponent(err)}`);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  if (!code) {
    res.redirect(302, "/login?satspay_error=missing_code");
    return;
  }
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  const redirectUri = resolveRedirectUri(req);
  if (!redirectUri) {
    res.redirect(302, "/login?satspay_error=redirect_invalid");
    return;
  }

  const safeCode = JSON.stringify(code);
  const safeState = JSON.stringify(state);
  const safeRedirect = JSON.stringify(redirectUri);

  res
    .status(200)
    .type("html")
    .send(`<!doctype html><meta charset="utf-8"/><title>SatsPay</title>
<script>
(function () {
  var code = ${safeCode};
  var state = ${safeState};
  var redirectUri = ${safeRedirect};
  var verifier = null;
  try {
    var key = "satspay_pkce_" + String(state || "");
    verifier = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
  } catch (e) {}
  if (!verifier) {
    window.location.replace("/login?satspay_error=pkce_missing");
    return;
  }
  fetch("/api/auth/satspay", {
    method: "POST",
    credentials: "include",
    headers: (function () {
      var h = { "Content-Type": "application/json", Accept: "application/json" };
      try {
        var m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
        if (m) h["x-csrf-token"] = decodeURIComponent(m[1]);
      } catch (e) {}
      return h;
    })(),
    body: JSON.stringify({ code: code, codeVerifier: verifier, redirectUri: redirectUri })
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (x) {
      if (x.ok && x.j && x.j.ok) {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: "SATSPAY_AUTH_SUCCESS", code: code, sessionReady: true }, location.origin);
          }
        } catch (e) {}
        try { if (window.opener && !window.opener.closed) { window.close(); } } catch (e) {}
        window.location.replace("/dashboard");
        return;
      }
      var fail = (x.j && x.j.code) ? String(x.j.code) : "exchange_failed";
      window.location.replace("/login?satspay_error=" + encodeURIComponent(fail));
    })
    .catch(function () {
      window.location.replace("/login?satspay_error=internal");
    });
})();
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:3rem">Entrando…</p>`);
}
