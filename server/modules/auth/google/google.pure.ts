/** Pure helpers for Google userinfo → BlockMiner username mapping (unit-tested). */

const USERNAME_MAX = 24;
const USERNAME_MIN = 3;

export function sanitizeGoogleUsername(raw: unknown): string {
  const base = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base.length >= USERNAME_MIN) return base.slice(0, USERNAME_MAX);
  const fallback = `g_${String(raw ?? "user")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toLowerCase()}`;
  return (fallback.length >= USERNAME_MIN ? fallback : `google_${Date.now().toString(36)}`).slice(0, USERNAME_MAX);
}

export type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export function parseGoogleUserInfo(body: unknown): GoogleUserInfo | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const sub = typeof o.sub === "string" && o.sub.trim() ? o.sub.trim() : "";
  if (!sub) return null;
  return {
    sub,
    email: typeof o.email === "string" ? o.email.trim().toLowerCase() : undefined,
    email_verified: o.email_verified === true || o.email_verified === "true",
    name: typeof o.name === "string" ? o.name : undefined,
    picture: typeof o.picture === "string" ? o.picture : undefined,
  };
}

export function pickGoogleDisplayName(info: GoogleUserInfo): string {
  const n = String(info.name || "").trim();
  if (n) return n.slice(0, 64);
  if (info.email) return info.email.split("@")[0]!.slice(0, 64);
  return `Google_${info.sub.slice(0, 8)}`;
}
