/** Ported from legacy/server/modules/partnerGames/partner-games.embed.types.ts (embed status only). */
export type PartnerLaunchMode = "iframe" | "external";

export type PartnerEmbedStatus =
  | "embeddable"
  | "blocked_x_frame_options"
  | "blocked_frame_ancestors"
  | "blocked_cloudflare"
  | "auth_page"
  | "api_endpoint"
  | "fetch_error"
  | "unknown";

export interface PartnerEmbedProbeResult {
  status: PartnerEmbedStatus;
  reason: string;
  reasonCode: string;
  probedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  xFrameOptions: string | null;
  frameAncestors: string | null;
  contentType: string | null;
  isCloudflareChallenge: boolean;
  isJsonResponse: boolean;
  probedAt: string;
}

export const BLOCKMINER_EMBED_ORIGIN = "https://blockminer.space";

/** Hosts known to break when embedded (login redirect / embed mode bug). */
export const PARTNER_EXTERNAL_ONLY_HOSTS = ["minercore.online"] as const;
