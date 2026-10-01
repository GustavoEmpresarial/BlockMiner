/**
 * Opens the MinerCore MCX9 offer once and attaches the three PNG miners if they are missing.
 * An existing event is not rewritten, so a restart does not slide the 60-day window.
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
  MINERCORE_IMAGE_OFFER_LEGACY_NAMES,
  MINERCORE_IMAGE_OFFER_MINERS,
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

function imageMinerCreate(miner: (typeof MINERCORE_IMAGE_OFFER_MINERS)[number]) {
  return {
    name: miner.name,
    description: miner.description,
    imageUrl: miner.imageUrl,
    modelUrl: null,
    deliveryDelayDays: 0,
    price: miner.priceBlk,
    hashRate: miner.hashRate,
    currency: DEFAULT_OFFER_CURRENCY,
    stockUnlimited: true,
    stockCount: null,
    slotSize: 1,
    isActive: true,
    isFree: false,
    claimLimitPerUser: 1,
  };
}

/**
 * Adds the three PNG miners, or renames the previous ticker names in place.
 * Does not move the offer window and does not rewrite a row that already has the new name.
 */
async function ensureMinercoreImageMiners(eventId: number): Promise<number> {
  const existing = await prisma.eventMiner.findMany({
    where: { eventId },
    select: { id: true, name: true },
  });
  const byName = new Map(existing.map((miner) => [miner.name, miner.id]));
  let changed = 0;
  for (const miner of MINERCORE_IMAGE_OFFER_MINERS) {
    if (byName.has(miner.name)) continue;
    const legacyName = MINERCORE_IMAGE_OFFER_LEGACY_NAMES[miner.name];
    const legacyId = byName.get(legacyName);
    if (legacyId != null) {
      await prisma.eventMiner.update({
        where: { id: legacyId },
        data: {
          name: miner.name,
          description: miner.description,
          imageUrl: miner.imageUrl,
          modelUrl: null,
          deliveryDelayDays: 0,
        },
      });
      changed += 1;
      continue;
    }
    await prisma.eventMiner.create({
      data: { eventId, ...imageMinerCreate(miner) },
    });
    changed += 1;
  }
  return changed;
}

export async function ensureMinercoreMcx9Offer(now: Date = new Date()): Promise<void> {
  const existing = await prisma.offerEvent.findFirst({
    where: { title: MINERCORE_MCX9_OFFER_TITLE, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    const added = await ensureMinercoreImageMiners(existing.id);
    if (added > 0) log.info("MinerCore image miners added", { eventId: existing.id, added });
    return;
  }

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
        create: [
          {
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
          ...MINERCORE_IMAGE_OFFER_MINERS.map((miner) => imageMinerCreate(miner)),
        ],
      },
    },
  });
  log.info("MinerCore MCX9 offer opened", {
    endsAt: endsAt.toISOString(),
    deliveryDelayDays: MINERCORE_MCX9_DELIVERY_DELAY_DAYS,
    imageMiners: MINERCORE_IMAGE_OFFER_MINERS.length,
  });
}
