/** Default when TRUST_PROXY is unset — Express hop count. */
export const DEFAULT_TRUST_PROXY_HOPS = 1;

/**
 * Express's `trust proxy` treats the STRING "true"/"false" differently from booleans.
 * Env vars always arrive as strings — normalize before `app.set("trust proxy", ...)`.
 */
export function resolveTrustProxy(
  rawEnv: string | undefined | null = process.env.TRUST_PROXY,
): boolean | number | string {
  const raw = String(rawEnv ?? "").trim();
  if (!raw) return DEFAULT_TRUST_PROXY_HOPS;
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}
