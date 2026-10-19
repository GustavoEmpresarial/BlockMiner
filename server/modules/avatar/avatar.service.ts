/**
 * Profile photo behind a US$ 1 annual license paid from an internal crypto balance (never BLK).
 * Money path: per-user advisory lock + idempotency key + conditional debit, all in one transaction.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { invalidateBalanceCache } from "../wallet/balance/balance.service.js";
import { invalidateAuthUserCache } from "../../shared/security/authUser.js";
import { mediaDiskDir } from "../media/media.config.js";
import { AvatarError } from "./avatar.errors.js";
import { getAvatarUsdRate } from "./avatar.pricing.js";
import { getCertificateView } from "./avatar.certificate.js";
import {
  AVATAR_BALANCE_COLUMN,
  AVATAR_CURRENCIES,
  AVATAR_CHANNELS,
  AVATAR_PRICE_USD,
  AVATAR_MEDIA_CATEGORY,
  computeLicenseAmount,
  isAvatarCurrency,
  isAvatarFilename,
  isLicenseActive,
  nextLicenseExpiry,
  quoteStillValid,
  resolveAvatarChannel,
  resolveAvatarUrl,
  type AvatarChannel,
  type AvatarCurrency,
} from "./avatar.rules.js";

const log = logger.child("Avatar");

export const AVATAR_MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const AVATAR_MAX_INPUT_PIXELS = 40_000_000;
const AVATAR_SIZE_PX = 256;
const ALLOWED_INPUT_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidIdempotencyKey(v: unknown): v is string {
  return typeof v === "string" && IDEMPOTENCY_KEY.test(v);
}

async function readAvatarRow(userId: number) {
  return prisma.userAvatar.findUnique({ where: { userId } });
}

export async function getAvatarStatus(userId: number, now = new Date()) {
  const [row, balances, certificate] = await Promise.all([
    readAvatarRow(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { polBalance: true, shibBalance: true },
    }),
    getCertificateView(userId, now).catch(() => null),
  ]);
  const quotes = await Promise.all(
    AVATAR_CURRENCIES.map(async (currency) => {
      const rate = await getAvatarUsdRate(currency);
      const balanceKey = `${currency.toLowerCase()}Balance` as keyof NonNullable<typeof balances>;
      const amounts = Object.fromEntries(
        AVATAR_CHANNELS.map((ch) => [ch, rate ? computeLicenseAmount(rate, AVATAR_PRICE_USD[ch]).toFixed(8) : null]),
      ) as Record<AvatarChannel, string | null>;
      return {
        currency,
        /** Settings price (kept as `amount` for the Settings card). */
        amount: amounts.settings,
        amounts,
        balance: balances ? new Prisma.Decimal(balances[balanceKey] ?? 0).toFixed(8) : "0.00000000",
      };
    }),
  );
  const expiresAt = row?.licenseExpiresAt ?? null;
  return {
    priceUsd: AVATAR_PRICE_USD.settings,
    prices: AVATAR_PRICE_USD,
    licenseActive: isLicenseActive(expiresAt, now),
    licenseExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    canRenew: nextLicenseExpiry(now, expiresAt) != null,
    uploadBlocked: Boolean(row?.uploadBlocked),
    avatarUrl: resolveAvatarUrl(row, now),
    certificate,
    quotes,
  };
}

export type LicensePurchaseResult = {
  licenseId: number;
  currency: AvatarCurrency;
  amount: string;
  expiresAt: string;
  replayed: boolean;
};

export async function purchaseAvatarLicense(input: {
  userId: number;
  currency: unknown;
  expectedAmount: unknown;
  idempotencyKey: unknown;
  channel?: unknown;
  requestId?: string | null;
  now?: Date;
}): Promise<LicensePurchaseResult> {
  const { userId } = input;
  if (!isAvatarCurrency(input.currency)) throw new AvatarError("AVATAR_CURRENCY_NOT_ALLOWED");
  if (!isValidIdempotencyKey(input.idempotencyKey)) throw new AvatarError("AVATAR_IDEMPOTENCY_KEY_INVALID");
  const currency = input.currency;
  const idempotencyKey = input.idempotencyKey;

  const usdRate = await getAvatarUsdRate(currency);
  if (usdRate == null) throw new AvatarError("AVATAR_PRICE_UNAVAILABLE");
  const channel = resolveAvatarChannel(input.channel);
  const priceUsd = AVATAR_PRICE_USD[channel];
  const amount = computeLicenseAmount(usdRate, priceUsd);
  const column = AVATAR_BALANCE_COLUMN[currency];

  const result = await prisma.$transaction(async (tx) => {
    // Serializes this user's purchases (double click, two tabs) for the rest of the transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`avatar_license:${userId}`}, 0))`;

    const previous = await tx.avatarLicense.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (previous) {
      return { licenseId: previous.id, currency: previous.currency as AvatarCurrency, amount: previous.amount.toFixed(8), expiresAt: previous.expiresAt.toISOString(), replayed: true };
    }

    const now = input.now ?? new Date();
    const current = await tx.userAvatar.findUnique({ where: { userId }, select: { licenseExpiresAt: true } });
    const expiresAt = nextLicenseExpiry(now, current?.licenseExpiresAt ?? null);
    if (!expiresAt) throw new AvatarError("AVATAR_LICENSE_ALREADY_ACTIVE");
    if (!quoteStillValid(amount, input.expectedAmount)) throw new AvatarError("AVATAR_QUOTE_CHANGED");

    // Conditional debit: never below zero, whatever else runs concurrently on this balance.
    const debited = await tx.$executeRaw(
      Prisma.sql`UPDATE users SET ${Prisma.raw(column)} = ${Prisma.raw(column)} - ${amount} WHERE id = ${userId} AND ${Prisma.raw(column)} >= ${amount}`,
    );
    if (debited !== 1) throw new AvatarError("AVATAR_INSUFFICIENT_BALANCE");

    const license = await tx.avatarLicense.create({
      data: { userId, currency, amount, usdRate: new Prisma.Decimal(usdRate), usdPrice: new Prisma.Decimal(priceUsd), startsAt: now, expiresAt, idempotencyKey },
    });
    await tx.userAvatar.upsert({
      where: { userId },
      create: { userId, licenseExpiresAt: expiresAt },
      update: { licenseExpiresAt: expiresAt },
    });
    await tx.transaction.create({
      data: {
        userId,
        type: "avatar_license",
        amount,
        rawTx: JSON.stringify({ asset: currency, licenseId: license.id, channel }),
        status: "completed",
        completedAt: now,
        usdRateAtConfirmation: new Prisma.Decimal(usdRate),
        usdValueAtConfirmation: new Prisma.Decimal(priceUsd),
      },
    });
    return { licenseId: license.id, currency, amount: amount.toFixed(8), expiresAt: expiresAt.toISOString(), replayed: false };
  });

  if (!result.replayed) {
    invalidateBalanceCache(userId);
    invalidateAuthUserCache(userId);
    log.info("avatar.license.purchased", { userId, licenseId: result.licenseId, channel, priceUsd, currency, amount: result.amount, usdRate, expiresAt: result.expiresAt, requestId: input.requestId ?? null });
  }
  return result;
}

/** Throws unless the user may upload right now (checked before the file is even read). */
export async function assertCanUpload(userId: number, now = new Date()): Promise<void> {
  const row = await readAvatarRow(userId);
  if (row?.uploadBlocked) throw new AvatarError("AVATAR_UPLOAD_BLOCKED");
  if (!isLicenseActive(row?.licenseExpiresAt, now)) throw new AvatarError("AVATAR_LICENSE_REQUIRED");
}

/**
 * Decodes and re-encodes the upload: 256x256 WebP, EXIF stripped, first frame only. Anything sharp
 * cannot decode, or that is not a raster PNG/JPEG/WebP/GIF (SVG, TIFF, HEIF...), is refused.
 */
export async function normalizeAvatarImage(input: Buffer): Promise<Buffer> {
  try {
    const img = sharp(input, { limitInputPixels: AVATAR_MAX_INPUT_PIXELS, animated: false, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format)) throw new AvatarError("AVATAR_UPLOAD_INVALID");
    return await img
      .rotate()
      .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (err) {
    if (err instanceof AvatarError) throw err;
    throw new AvatarError("AVATAR_UPLOAD_INVALID");
  }
}

function avatarFilePath(filename: string): string {
  return path.join(mediaDiskDir(AVATAR_MEDIA_CATEGORY), filename);
}

async function removeAvatarFile(filename: string | null | undefined): Promise<void> {
  if (!isAvatarFilename(filename)) return;
  await fs.promises.unlink(avatarFilePath(filename)).catch(() => undefined);
}

export async function saveAvatarPhoto(userId: number, upload: Buffer, now = new Date()): Promise<{ avatarUrl: string | null }> {
  await assertCanUpload(userId, now);
  const webp = await normalizeAvatarImage(upload);
  const filename = `${randomBytes(16).toString("hex")}.webp`;
  await fs.promises.writeFile(avatarFilePath(filename), webp, { flag: "wx" });

  let previous: string | null = null;
  try {
    const row = await prisma.$transaction(async (tx) => {
      const before = await tx.userAvatar.findUnique({ where: { userId }, select: { path: true } });
      previous = before?.path ?? null;
      // Re-checked in the write itself: a block or expiry that lands mid-upload wins.
      const updated = await tx.userAvatar.updateMany({
        where: { userId, uploadBlocked: false, licenseExpiresAt: { gt: now } },
        data: { path: filename },
      });
      if (updated.count !== 1) throw new AvatarError("AVATAR_LICENSE_REQUIRED");
      return tx.userAvatar.findUnique({ where: { userId } });
    });
    await removeAvatarFile(previous);
    log.info("avatar.photo.updated", { userId, bytes: webp.length });
    return { avatarUrl: resolveAvatarUrl(row, now) };
  } catch (err) {
    await removeAvatarFile(filename);
    throw err;
  }
}

export async function removeAvatarPhoto(userId: number, opts: { block?: boolean } = {}): Promise<{ previousPath: string | null }> {
  const before = await readAvatarRow(userId);
  if (!before && !opts.block) return { previousPath: null };
  await prisma.userAvatar.upsert({
    where: { userId },
    create: { userId, path: null, uploadBlocked: Boolean(opts.block) },
    update: { path: null, ...(opts.block !== undefined ? { uploadBlocked: opts.block } : {}) },
  });
  await removeAvatarFile(before?.path);
  return { previousPath: before?.path ?? null };
}
