/** Pure helpers for SatsPay userinfo → BlockMiner username mapping (unit-tested). */

const USERNAME_MAX = 24;
const USERNAME_MIN = 3;

export function sanitizeSatspayUsername(raw: unknown): string {
  const base = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base.length >= USERNAME_MIN) return base.slice(0, USERNAME_MAX);
  const fallback = `sats_${String(raw ?? "user")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12)
    .toLowerCase()}`;
  return (fallback.length >= USERNAME_MIN ? fallback : `sats_${Date.now().toString(36)}`).slice(0, USERNAME_MAX);
}

export type SatspayUserInfo = {
  sub: string;
  id?: string;
  username?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
};

export function parseSatspayUserInfo(body: unknown): SatspayUserInfo | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const sub = typeof o.sub === "string" && o.sub.trim() ? o.sub.trim() : typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
  if (!sub) return null;
  return {
    sub,
    id: typeof o.id === "string" ? o.id : undefined,
    username: typeof o.username === "string" ? o.username : undefined,
    name: typeof o.name === "string" ? o.name : undefined,
    email: typeof o.email === "string" ? o.email.trim().toLowerCase() : undefined,
    email_verified: o.email_verified === true || o.email_verified === "true",
    picture: typeof o.picture === "string" ? o.picture : undefined,
  };
}

export function pickDisplayName(info: SatspayUserInfo): string {
  const n = String(info.name || info.username || "").trim();
  if (n) return n.slice(0, 64);
  if (info.email) return info.email.split("@")[0]!.slice(0, 64);
  return `SatsPay_${info.sub.slice(0, 8)}`;
}
