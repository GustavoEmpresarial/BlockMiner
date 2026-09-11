/**
 * SatsPay OAuth HTTP client — token exchange + userinfo.
 */
import { satspayApiBase, readSatspayOAuthConfig } from "./satspay.config.js";
import { parseSatspayUserInfo, type SatspayUserInfo } from "./satspay.pure.js";

const TOKEN_TIMEOUT_MS = Number(process.env.SATSPAY_HTTP_TIMEOUT_MS || 15_000);

export type SatspayTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TOKEN_TIMEOUT_MS): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function exchangeSatspayAuthorizationCode(args: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SatspayTokenResponse> {
  const cfg = readSatspayOAuthConfig(args.env);
  if (!cfg.enabled) {
    throw Object.assign(new Error("SatsPay OAuth is not configured"), { code: "SATSPAY_DISABLED" });
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });
  const res = await fetchWithTimeout(`${satspayApiBase(args.env)}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || typeof json.access_token !== "string") {
    const msg =
      (json && typeof json.error_description === "string" && json.error_description) ||
      (json && typeof json.message === "string" && json.message) ||
      (json && typeof json.error === "string" && json.error) ||
      `token_exchange_failed_${res.status}`;
    throw Object.assign(new Error(msg), { code: "SATSPAY_TOKEN_EXCHANGE_FAILED", status: res.status });
  }
  return {
    access_token: json.access_token,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export async function fetchSatspayUserInfo(args: {
  accessToken: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SatspayUserInfo> {
  const res = await fetchWithTimeout(`${satspayApiBase(args.env)}/v1/oauth/userinfo`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: "application/json",
    },
  });
  const json = await res.json().catch(() => null);
  const info = parseSatspayUserInfo(json);
  if (!res.ok || !info) {
    throw Object.assign(new Error(`userinfo_failed_${res.status}`), {
      code: "SATSPAY_USERINFO_FAILED",
      status: res.status,
    });
  }
  return info;
}
