/**
 * SatsPay OAuth 2.0 / OIDC — env readers (no magic defaults for secrets).
 * Docs: https://www.satspay.pro/.well-known/openid-configuration
 */
function envFlagOn(raw: string | undefined): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export const SATSPAY_DEFAULT_API_BASE = "https://www.satspay.pro";
export const SATSPAY_DEFAULT_SDK_PATH = "/sdk/satspay-auth.v2.js";
export const SATSPAY_CALLBACK_PATH = "/api/auth/satspay/callback";

export type SatspayOAuthConfig = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  apiBase: string;
  sdkUrl: string;
  redirectUris: string[];
  theme: "light" | "dark" | "bitcoin";
};

export function satspayApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.SATSPAY_API_BASE ?? SATSPAY_DEFAULT_API_BASE).trim().replace(/\/$/, "") || SATSPAY_DEFAULT_API_BASE;
}

export function parseSatspayRedirectUris(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = String(env.SATSPAY_REDIRECT_URIS ?? "").trim();
  const fromList = raw
    ? raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  const single = String(env.SATSPAY_REDIRECT_URI ?? "").trim();
  const appUrl = String(env.APP_URL ?? "").trim().replace(/\/$/, "");
  const out = new Set<string>(fromList);
  if (single) out.add(single);
  if (appUrl) out.add(`${appUrl}${SATSPAY_CALLBACK_PATH}`);
  // Known public hosts for BlockMiner (maintenance bypass + www).
  for (const host of ["https://blockminer.space", "https://www.blockminer.space", "https://dev.blockminer.space"]) {
    out.add(`${host}${SATSPAY_CALLBACK_PATH}`);
  }
  return [...out];
}

export function readSatspayOAuthConfig(env: NodeJS.ProcessEnv = process.env): SatspayOAuthConfig {
  const clientId = String(env.SATSPAY_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.SATSPAY_CLIENT_SECRET ?? "").trim();
  const apiBase = satspayApiBase(env);
  const themeRaw = String(env.SATSPAY_BUTTON_THEME ?? "light").trim().toLowerCase();
  const theme = themeRaw === "dark" || themeRaw === "bitcoin" ? themeRaw : "light";
  const enabledExplicit = env.SATSPAY_OAUTH_ENABLED;
  const enabled =
    enabledExplicit !== undefined && String(enabledExplicit).trim() !== ""
      ? envFlagOn(enabledExplicit)
      : Boolean(clientId && clientSecret);

  return {
    enabled: enabled && Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    apiBase,
    sdkUrl: `${apiBase}${SATSPAY_DEFAULT_SDK_PATH}`,
    redirectUris: parseSatspayRedirectUris(env),
    theme,
  };
}

export function isAllowedSatspayRedirectUri(
  redirectUri: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const want = String(redirectUri || "").trim();
  if (!want) return false;
  return parseSatspayRedirectUris(env).includes(want);
}

/** Public payload for the login page / SDK (never includes client_secret). */
export function satspayPublicClientConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { requestHost?: string },
) {
  const cfg = readSatspayOAuthConfig(env);
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
    sdkUrl: cfg.sdkUrl,
    theme: cfg.theme,
    scope: "openid profile email",
  };
}
