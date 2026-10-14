/**
 * Signed user id carried in partner offerwall links (Offerwall.me path, Offerwall.GG `userId`,
 * Multiwall `id`, MoneyRain `uid`) and echoed back in their callbacks.
 *
 * Format `{userId}x{hmacHex}`: alphanumeric only, so it survives partners that restrict subid
 * charsets. The HMAC covers the provider, so a subid issued for one wall is rejected by another.
 * Without `OFFERWALL_SUBID_SECRET` signing is off and the raw numeric id is used (dev / pre-rollout).
 * `OFFERWALL_SUBID_ACCEPT_LEGACY=1` keeps accepting raw numeric ids from links issued before the
 * secret was set; turn it off once `offerwall.subid.legacy_accepted` stops appearing in the logs.
 */
import crypto from "node:crypto";
import { logger } from "../../core/logger/index.js";

const log = logger.child("offerwall.subid");

export type OfferwallSubIdProvider = "offerwallme" | "offerwallgg" | "multiwall" | "moneyrain";

/** 64 bits of HMAC: every forgery guess costs a completed partner offer. */
export const OFFERWALL_SUBID_SIG_HEX_LEN = 16;
const SEPARATOR = "x";
const SIGNED_RE = /^(\d+)x([0-9a-f]+)$/;
const RAW_RE = /^\d+$/;

function readSecret(): string {
  return String(process.env.OFFERWALL_SUBID_SECRET ?? "").trim();
}

function acceptLegacy(): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env.OFFERWALL_SUBID_ACCEPT_LEGACY ?? "").trim());
}

function signature(secret: string, provider: OfferwallSubIdProvider, userId: number): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${provider}:${userId}`)
    .digest("hex")
    .slice(0, OFFERWALL_SUBID_SIG_HEX_LEN);
}

export function signOfferwallSubId(provider: OfferwallSubIdProvider, userId: number): string {
  const secret = readSecret();
  if (!secret) return String(userId);
  return `${userId}${SEPARATOR}${signature(secret, provider, userId)}`;
}

export type OfferwallSubIdParse =
  | { ok: true; userId: number; legacy: boolean }
  | { ok: false; reason: "malformed" | "bad_signature" | "legacy_rejected" };

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function parseOfferwallSubId(provider: OfferwallSubIdProvider, rawInput: unknown): OfferwallSubIdParse {
  const raw = String(rawInput ?? "").trim().toLowerCase();
  const secret = readSecret();

  if (RAW_RE.test(raw)) {
    const userId = positiveInt(raw);
    if (userId === null) return { ok: false, reason: "malformed" };
    if (!secret) return { ok: true, userId, legacy: false };
    if (acceptLegacy()) {
      log.warn("offerwall.subid.legacy_accepted", { provider, userId });
      return { ok: true, userId, legacy: true };
    }
    log.warn("offerwall.subid.legacy_rejected", { provider, userId });
    return { ok: false, reason: "legacy_rejected" };
  }

  const match = SIGNED_RE.exec(raw);
  if (!match) return { ok: false, reason: "malformed" };
  const userId = positiveInt(match[1]!);
  if (userId === null) return { ok: false, reason: "malformed" };
  if (!secret) {
    log.warn("offerwall.subid.signed_without_secret", { provider, userId });
    return { ok: false, reason: "bad_signature" };
  }

  const expected = Buffer.from(signature(secret, provider, userId), "utf8");
  const provided = Buffer.from(match[2]!, "utf8");
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    log.warn("offerwall.subid.bad_signature", { provider, userId });
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, userId, legacy: false };
}
