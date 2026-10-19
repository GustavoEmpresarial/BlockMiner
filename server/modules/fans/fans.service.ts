import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { miningEngine } from "../mining/index.js";
import {
  isFanPurchaseLiveAt,
  isFansFeatureEnabled,
  readFanMaxBulkQuantity,
  readFanOfferPrice,
  readFanShopPrice,
} from "./fans.config.js";
import { normalizeFanSku, readFanCatalogItem, type FanSku } from "./fans.catalog.js";
import { FAN_ERROR_MESSAGE } from "./fans.errors.js";

export type FanPurchaseResult = {
  newBalance: number;
  fanCredits: number;
  sku: FanSku;
  quantity: number;
  totalPrice: number;
  unitPrice: number;
  creditsGranted: number;
};

export async function getFanCreditsForUser(userId: number): Promise<number> {
  if (!isFansFeatureEnabled()) return 0;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { fanCredits: true },
  });
  return Math.max(0, Number(row?.fanCredits ?? 0));
}

export async function purchaseFansForUser(
  userId: number,
  sku: string,
  quantity: number,
  channel: "shop" | "offer",
  now: Date,
): Promise<FanPurchaseResult> {
  if (!isFansFeatureEnabled()) {
    throw new Error(FAN_ERROR_MESSAGE.NOT_AVAILABLE_YET);
  }
  if (!isFanPurchaseLiveAt(now)) {
    throw new Error(FAN_ERROR_MESSAGE.NOT_AVAILABLE_YET);
  }
  const normalizedSku = normalizeFanSku(sku);
  if (!normalizedSku) {
    throw new Error(FAN_ERROR_MESSAGE.INVALID_SKU);
  }
  const maxBulk = readFanMaxBulkQuantity();
  const qty = Math.floor(Number(quantity) || 0);
  if (!Number.isInteger(qty) || qty < 1 || qty > maxBulk) {
    throw new Error(FAN_ERROR_MESSAGE.INVALID_QUANTITY);
  }

  const catalogItem = readFanCatalogItem(normalizedSku);
  if (!catalogItem) {
    throw new Error(FAN_ERROR_MESSAGE.INVALID_SKU);
  }

  const unitPrice = channel === "offer" ? readFanOfferPrice() : readFanShopPrice();
  // Decimal math: 0.1 * 3 in floats is 0.30000000000000004.
  const total = new Prisma.Decimal(unitPrice).mul(qty).toDecimalPlaces(8, Prisma.Decimal.ROUND_UP);
  const totalPrice = total.toNumber();
  const creditsGranted = catalogItem.creditsPerUnit * qty;

  return prisma.$transaction(async (tx) => {
    // One lock per user for every fan purchase: it used to be per sku+channel, so a shop and an
    // offer purchase at the same time both passed the balance check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, hashtext('fan-purchase')::int)`;

    const debited = await tx.user.updateMany({
      where: { id: userId, blkBalance: { gte: total } },
      data: { blkBalance: { decrement: total }, fanCredits: { increment: creditsGranted } },
    });
    if (debited.count !== 1) {
      throw new Error(FAN_ERROR_MESSAGE.INSUFFICIENT_BALANCE);
    }
    const updated = await tx.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true, fanCredits: true },
    });

    // Purchase history (wallet ledger + audit): fan purchases left no record before.
    await tx.transaction.create({
      data: {
        userId,
        type: "fan_purchase",
        amount: total,
        rawTx: JSON.stringify({
          asset: "blk",
          sku: normalizedSku,
          channel,
          quantity: qty,
          unitPrice,
          creditsGranted,
          creditsAfter: Number(updated?.fanCredits ?? 0),
        }),
        status: "completed",
        completedAt: new Date(),
      },
    });

    return {
      newBalance: Number(updated?.blkBalance ?? 0),
      fanCredits: Math.max(0, Number(updated?.fanCredits ?? 0)),
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
