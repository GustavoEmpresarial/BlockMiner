/**
 * Google OAuth 2.0 / OIDC — env readers (no magic defaults for secrets).
 */
function envFlagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_OAUTH_SCOPE = "openid email profile";
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

export type GoogleOAuthConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
};

export function parseGoogleRedirectUris(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = String(env.GOOGLE_REDIRECT_URIS ?? "").trim();
  const fromList = raw
    ? raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  const single = String(env.GOOGLE_REDIRECT_URI ?? "").trim();
  const appUrl = String(env.APP_URL ?? "").trim().replace(/\/$/, "");
  const out = new Set<string>(fromList);
  if (single) out.add(single);
  if (appUrl) out.add(`${appUrl}${GOOGLE_CALLBACK_PATH}`);
  for (const host of ["https://blockminer.space", "https://www.blockminer.space", "https://dev.blockminer.space"]) {
    out.add(`${host}${GOOGLE_CALLBACK_PATH}`);
  }
  return [...out];
}

export function readGoogleOAuthConfig(env: NodeJS.ProcessEnv = process.env): GoogleOAuthConfig {
  const clientId = String(env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const enabledExplicit = env.GOOGLE_OAUTH_ENABLED;
  const enabled =
    enabledExplicit !== undefined && String(enabledExplicit).trim() !== ""
      ? envFlagOn(enabledExplicit)
      : Boolean(clientId && clientSecret);

  return {
    enabled: enabled && Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    redirectUris: parseGoogleRedirectUris(env),
  };
}

export function isAllowedGoogleRedirectUri(
  redirectUri: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const want = String(redirectUri || "").trim();
  if (!want) return false;
  return parseGoogleRedirectUris(env).includes(want);
}

/** Public payload for the login page (never includes client_secret). */
export function googlePublicClientConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { requestHost?: string },
) {
  const cfg = readGoogleOAuthConfig(env);
  const host = String(opts?.requestHost ?? "")
    .toLowerCase()
    .split(":")[0]
    .replace(/\.$/, "");
  let redirectUri = cfg.redirectUris[0] ?? "";
  if (host) {
    const match = cfg.redirectUris.find((u) => {
      try {
        return new URL(u).hostname === host;
      } catch {
        return false;
      }
    });
    if (match) redirectUri = match;
  }
  return {
    enabled: cfg.enabled,
    clientId: cfg.enabled ? cfg.clientId : "",
    redirectUri,
    redirectUris: cfg.redirectUris,
    authUrl: GOOGLE_OAUTH_AUTHORIZE_URL,
    scope: GOOGLE_OAUTH_SCOPE,
  };
}
