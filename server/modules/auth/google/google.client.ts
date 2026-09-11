/**
 * Google OAuth HTTP client — token exchange + userinfo.
 */
import {
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_OAUTH_USERINFO_URL,
  readGoogleOAuthConfig,
} from "./google.config.js";
import { parseGoogleUserInfo, type GoogleUserInfo } from "./google.pure.js";

export const GOOGLE_HTTP_TIMEOUT_MS_DEFAULT = 15_000;

export function readGoogleHttpTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.GOOGLE_HTTP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : GOOGLE_HTTP_TIMEOUT_MS_DEFAULT;
}

export type GoogleTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  const timeoutMs = readGoogleHttpTimeoutMs(env);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function exchangeGoogleAuthorizationCode(args: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  env?: NodeJS.ProcessEnv;
}): Promise<GoogleTokenResponse> {
  const cfg = readGoogleOAuthConfig(args.env);
  if (!cfg.enabled) {
    throw Object.assign(new Error("Google OAuth is not configured"), { code: "GOOGLE_DISABLED" });
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
  const res = await fetchWithTimeout(
    GOOGLE_OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    },
    args.env,
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || typeof json.access_token !== "string") {
    const msg =
      (json && typeof json.error_description === "string" && json.error_description) ||
      (json && typeof json.error === "string" && json.error) ||
      `token_exchange_failed_${res.status}`;
    throw Object.assign(new Error(msg), { code: "GOOGLE_TOKEN_EXCHANGE_FAILED", status: res.status });
  }
  return {
    access_token: json.access_token,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
    id_token: typeof json.id_token === "string" ? json.id_token : undefined,
  };
}

export async function fetchGoogleUserInfo(args: {
  accessToken: string;
  env?: NodeJS.ProcessEnv;
}): Promise<GoogleUserInfo> {
  const res = await fetchWithTimeout(
    GOOGLE_OAUTH_USERINFO_URL,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        Accept: "application/json",
      },
    },
    args.env,
  );
  const json = await res.json().catch(() => null);
  const info = parseGoogleUserInfo(json);
  if (!res.ok || !info) {
    throw Object.assign(new Error(`userinfo_failed_${res.status}`), {
      code: "GOOGLE_USERINFO_FAILED",
      status: res.status,
    });
  }
  return info;
}
