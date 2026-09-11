/** Pure helpers for Multiwall Ads PTC module (multiwall-ads.shop) — no Prisma. */
import crypto from "node:crypto";

/**
 * PTC postback hash: md5(secret + user_id + transaction + amount + amountus)
 * (Instruction page — Multiwall Ads / Offerwall PRO PTC Module).
 */
export function verifyMultiwallHash(
  secret: string,
  userId: string,
  transaction: string,
  amount: string,
  amountUs: string,
  hashuser: string,
): boolean {
  if (!secret) return false;
  const expected = crypto
    .createHash("md5")
    .update(secret + userId + transaction + amount + amountUs)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  let hashBuf: Buffer;
  try {
    hashBuf = Buffer.from(String(hashuser ?? "").trim(), "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, hashBuf);
}

/** @deprecated Use verifyMultiwallHash — kept name alias for older imports during transition. */
export function verifyMultiwallSignature(
  secret: string,
  userId: string,
  transaction: string,
  amount: string,
  hashuser: string,
  amountUs = "",
): boolean {
  return verifyMultiwallHash(secret, userId, transaction, amount, amountUs, hashuser);
}

export function parseAllowedIps(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Default iframe host from Multiwall PTC Instruction page. */
export const MULTIWALL_DEFAULT_EMBED_BASE = "https://multiwall-ads.shop/api.php";

/**
 * Embed: https://multiwall-ads.shop/api.php?page=main&api={API_KEY}&id={USER_ID}
 */
export function buildMultiwallEmbedUrl(args: {
  apiKey: string;
  userId: number;
  /** Full api.php URL or host base; query params are always appended. */
  baseUrl?: string;
}): string | null {
  const apiKey = String(args.apiKey ?? "").trim();
  if (!apiKey) return null;
  if (!Number.isFinite(args.userId) || args.userId <= 0) return null;

  const raw = String(args.baseUrl ?? MULTIWALL_DEFAULT_EMBED_BASE).trim();
  let base: string;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    // If env points at a path without api.php, normalize to api.php on that origin.
    if (!u.pathname.includes("api.php")) {
      u.pathname = "/api.php";
      u.search = "";
      u.hash = "";
    }
    base = u.origin + u.pathname;
  } catch {
    base = MULTIWALL_DEFAULT_EMBED_BASE;
  }

  const url = new URL(base);
  url.searchParams.set("page", "main");
  url.searchParams.set("api", apiKey);
  url.searchParams.set("id", String(args.userId));
  return url.toString();
}
