import prisma from "../../core/database/prisma.js";
import { miningEngine } from "../mining/index.js";
import {
  isRackPurchaseLiveAt,
  readRackMaxBulkQuantity,
  readRackOfferPrice,
  readRackShopPrice,
} from "./racks.config.js";
import { normalizeRackSku, readRackCatalogItem, type RackSku } from "./racks.catalog.js";
import { RACK_ERROR_MESSAGE } from "./racks.errors.js";

export type RackPurchaseResult = {
  newBalance: number;
  rackCredits: number;
  sku: RackSku;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
  creditsGranted: number;
};

export async function getRackCreditsForUser(userId: number): Promise<number> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { rackCredits: true },
  });
  return Math.max(0, Number(row?.rackCredits ?? 0));
}

export async function purchaseRacksForUser(
  userId: number,
  sku: string,
  quantity: number,
  channel: "shop" | "offer",
  now: Date,
): Promise<RackPurchaseResult> {
  if (!isRackPurchaseLiveAt(now)) {
    throw new Error(RACK_ERROR_MESSAGE.NOT_AVAILABLE_YET);
  }
  const normalizedSku = normalizeRackSku(sku);
  if (!normalizedSku) {
    throw new Error(RACK_ERROR_MESSAGE.INVALID_SKU);
  }
  const maxBulk = readRackMaxBulkQuantity();
  const qty = Math.floor(Number(quantity) || 0);
  if (!Number.isInteger(qty) || qty < 1 || qty > maxBulk) {
    throw new Error(RACK_ERROR_MESSAGE.INVALID_QUANTITY);
  }

  const catalogItem = readRackCatalogItem(normalizedSku);
  if (!catalogItem) {
    throw new Error(RACK_ERROR_MESSAGE.INVALID_SKU);
  }

  const unitPrice = channel === "offer" ? readRackOfferPrice() : readRackShopPrice();
  const totalPrice = unitPrice * qty;
  const creditsGranted = catalogItem.creditsPerUnit * qty;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, hashtext(${`rack:${normalizedSku}:${channel}`})::int)`;

    const userRow = await tx.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true, rackCredits: true },
    });
    const balanceBefore = Number(userRow?.blkBalance ?? 0);
    if (!userRow || balanceBefore < totalPrice) {
      throw new Error(RACK_ERROR_MESSAGE.INSUFFICIENT_BALANCE);
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        blkBalance: { decrement: totalPrice },
        rackCredits: { increment: creditsGranted },
      },
      select: { blkBalance: true, rackCredits: true },
    });

    return {
      newBalance: Number(updated.blkBalance ?? 0),
      rackCredits: Math.max(0, Number(updated.rackCredits ?? 0)),
      sku: normalizedSku,
      quantity: qty,
      totalPrice,
      unitPrice,
      creditsGranted,
    };
  }).then(async (result) => {
    try {
      await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
    } catch {
      /* best-effort */
    }
    return result;
  });
}
