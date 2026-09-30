/**
 * Opens the MinerCore MCX9 offer once. Image miners are untouched.
 * A row that already exists is left alone so a restart does not slide the 60-day window.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { OFFER_EVENT_MS_PER_DAY } from "./offer-events.config.js";
import {
  DEFAULT_MINERCORE_MCX9_HASH_RATE,
  DEFAULT_MINERCORE_MCX9_PRICE_BLK,
  DEFAULT_OFFER_CURRENCY,
  MINERCORE_MCX9_DELIVERY_DELAY_DAYS,
  MINERCORE_MCX9_HASH_RATE_ENV_KEY,
  MINERCORE_MCX9_IMAGE_URL,
  MINERCORE_MCX9_MODEL_URL,
  MINERCORE_MCX9_OFFER_DESCRIPTION,
  MINERCORE_MCX9_OFFER_DURATION_DAYS,
  MINERCORE_MCX9_OFFER_TITLE,
  MINERCORE_MCX9_PRICE_ENV_KEY,
} from "./offer-events.config.js";

const log = logger.child("offer-events.minercore-seed");

function readPriceBlk(): string {
  const raw = process.env[MINERCORE_MCX9_PRICE_ENV_KEY];
  if (raw == null || String(raw).trim() === "") return DEFAULT_MINERCORE_MCX9_PRICE_BLK;
  const trimmed = String(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error(`${MINERCORE_MCX9_PRICE_ENV_KEY} must be a positive decimal`);
  }
  return trimmed;
}

function readHashRate(): number {
  const raw = process.env[MINERCORE_MCX9_HASH_RATE_ENV_KEY];
  if (raw == null || String(raw).trim() === "") return DEFAULT_MINERCORE_MCX9_HASH_RATE;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${MINERCORE_MCX9_HASH_RATE_ENV_KEY} must be a positive number`);
  }
  return n;
}

export async function ensureMinercoreMcx9Offer(now: Date = new Date()): Promise<void> {
  const existing = await prisma.offerEvent.findFirst({
    where: { title: MINERCORE_MCX9_OFFER_TITLE, deletedAt: null },
    select: { id: true },
  });
  if (existing) return;

  const endsAt = new Date(now.getTime() + MINERCORE_MCX9_OFFER_DURATION_DAYS * OFFER_EVENT_MS_PER_DAY);
  await prisma.offerEvent.create({
    data: {
      title: MINERCORE_MCX9_OFFER_TITLE,
      description: MINERCORE_MCX9_OFFER_DESCRIPTION,
      imageUrl: MINERCORE_MCX9_IMAGE_URL,
      startsAt: now,
      endsAt,
      isActive: true,
      miners: {
        create: {
          name: MINERCORE_MCX9_OFFER_TITLE,
          description: MINERCORE_MCX9_OFFER_DESCRIPTION,
          imageUrl: MINERCORE_MCX9_IMAGE_URL,
          modelUrl: MINERCORE_MCX9_MODEL_URL,
          deliveryDelayDays: MINERCORE_MCX9_DELIVERY_DELAY_DAYS,
          price: readPriceBlk(),
          hashRate: readHashRate(),
          currency: DEFAULT_OFFER_CURRENCY,
          stockUnlimited: true,
          stockCount: null,
          slotSize: 1,
          isActive: true,
          isFree: false,
          claimLimitPerUser: 1,
        },
      },
    },
  });
  log.info("MinerCore MCX9 offer opened", {
    endsAt: endsAt.toISOString(),
    deliveryDelayDays: MINERCORE_MCX9_DELIVERY_DELAY_DAYS,
  });
}
