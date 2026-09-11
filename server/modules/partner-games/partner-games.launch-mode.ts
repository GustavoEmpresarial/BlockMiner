/**
 * Ported from legacy/server/modules/partnerGames/partner-games.launch-mode.ts.
 *
 * Deviation (documented): legacy also has a live embed-probe HTTP classifier
 * (partner-games.embed-probe.ts / partner-games.embed-sync.ts) that fetches the
 * partner iframe URL on admin create/update, inspects X-Frame-Options / CSP
 * frame-ancestors / Cloudflare-challenge markers, and auto-flips launchMode +
 * persists embedStatus/embedBlockReason/embedProbe. That is an admin-UX nicety
 * layered on top of the real server-authoritative mechanism (session/heartbeat
 * reward timing) — not core to it. It is intentionally NOT ported here to keep
 * this module's scope on the doctrine-relevant mechanism; admins set
 * launchMode explicitly (defaults to path-based inference below, same as
 * legacy's fallback). TODO: port the embed-probe classifier if/when partner
 * game catalog admin UX needs it.
 */
export function inferPartnerLaunchMode(iframeUrl: string): "iframe" | "external" {
  const raw = String(iframeUrl ?? "").trim();
  if (!raw) return "external";
  try {
    const u = new URL(raw);
    const path = u.pathname.toLowerCase();
    if (
      path.includes("/register") ||
      path.includes("/login") ||
      path.includes("/signup") ||
      path.startsWith("/api/")
    ) {
      return "external";
    }
  } catch {
    return "external";
  }
  return "iframe";
}

export function parsePartnerLaunchMode(value: unknown): "iframe" | "external" | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "iframe" || raw === "external") return raw;
  return null;
}
