/**
 * Pure rules for the profile-photo license: which balances can pay (POL or SHIB), how much to charge, when a renewal is allowed, and when a photo may be shown.
 */
import { Prisma } from "@prisma/client";
import { mediaPublicPath } from "../media/media.config.js";

/**
 * Price per sales channel: the Offers page sells the license at US$ 1; buying it straight from
 * Settings costs US$ 1.50. Always decided here, never taken from the client as an amount.
 */
export const AVATAR_CHANNELS = ["offers", "settings"] as const;
export type AvatarChannel = (typeof AVATAR_CHANNELS)[number];
export const AVATAR_PRICE_USD: Record<AvatarChannel, number> = { offers: 1, settings: 1.5 };
export const AVATAR_DEFAULT_CHANNEL: AvatarChannel = "settings";

export function resolveAvatarChannel(v: unknown): AvatarChannel {
  return typeof v === "string" && (AVATAR_CHANNELS as readonly string[]).includes(v) ? (v as AvatarChannel) : AVATAR_DEFAULT_CHANNEL;
}
export const AVATAR_LICENSE_DAYS = 365;
export const AVATAR_RENEW_WINDOW_DAYS = 30;
/** Server amount may exceed what the user saw by at most this much before we ask them to re-confirm. */
export const AVATAR_QUOTE_TOLERANCE = 0.02;
export const AVATAR_MEDIA_CATEGORY = "avatars";

/** Owner decision: the license is paid in POL or SHIB only. */
export const AVATAR_CURRENCIES = ["POL", "SHIB"] as const;
export type AvatarCurrency = (typeof AVATAR_CURRENCIES)[number];

/** Balance column per currency. Fixed map: the SQL identifier never comes from the request. */
export const AVATAR_BALANCE_COLUMN: Record<AvatarCurrency, string> = {
  POL: "pol_balance",
  SHIB: "shib_balance",
};

export function isAvatarCurrency(v: unknown): v is AvatarCurrency {
  return typeof v === "string" && (AVATAR_CURRENCIES as readonly string[]).includes(v);
}

const DAY_MS = 86_400_000;

/** USD price / rate, rounded UP to 8 decimals (we never undercharge by rounding). */
export function computeLicenseAmount(usdRate: number, priceUsd: number = AVATAR_PRICE_USD.offers): Prisma.Decimal {
  if (!Number.isFinite(usdRate) || usdRate <= 0) throw new Error("invalid usd rate");
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error("invalid usd price");
  return new Prisma.Decimal(priceUsd).div(new Prisma.Decimal(usdRate)).toDecimalPlaces(8, Prisma.Decimal.ROUND_UP);
}

/** True when the server amount is within tolerance of the amount the user confirmed. */
export function quoteStillValid(serverAmount: Prisma.Decimal, expectedAmount: unknown): boolean {
  const expected = Number(expectedAmount);
  if (!Number.isFinite(expected) || expected <= 0) return false;
  return serverAmount.lte(new Prisma.Decimal(expected).mul(1 + AVATAR_QUOTE_TOLERANCE));
}

/**
 * New expiry for a purchase, or null when the current license has more than the renewal window
 * left. Renewing early extends from the current expiry, so no paid day is lost.
 */
export function nextLicenseExpiry(now: Date, currentExpiresAt: Date | null | undefined): Date | null {
  const current = currentExpiresAt ? currentExpiresAt.getTime() : 0;
  if (current - now.getTime() > AVATAR_RENEW_WINDOW_DAYS * DAY_MS) return null;
  return new Date(Math.max(now.getTime(), current) + AVATAR_LICENSE_DAYS * DAY_MS);
}

export function isLicenseActive(expiresAt: Date | null | undefined, now: Date): boolean {
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
}

const AVATAR_FILENAME = /^[a-f0-9]{32}\.webp$/;

export function isAvatarFilename(v: unknown): v is string {
  return typeof v === "string" && AVATAR_FILENAME.test(v);
}

export type AvatarRow = { path: string | null; licenseExpiresAt: Date | null; uploadBlocked: boolean } | null | undefined;

/** The only place that decides whether a photo is visible. Null means "show the initial letter". */
export function resolveAvatarUrl(avatar: AvatarRow, now: Date = new Date()): string | null {
  if (!avatar || avatar.uploadBlocked || !isAvatarFilename(avatar.path)) return null;
  if (!isLicenseActive(avatar.licenseExpiresAt, now)) return null;
  return mediaPublicPath(AVATAR_MEDIA_CATEGORY, avatar.path);
}

/** Prisma select to add under `user: { select: { ... } }` wherever a user's avatar is rendered. */
export const AVATAR_SELECT = { avatar: { select: { path: true, licenseExpiresAt: true, uploadBlocked: true } } } as const;
