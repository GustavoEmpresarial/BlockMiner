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
  const totalPrice = unitPrice * qty;
  const creditsGranted = catalogItem.creditsPerUnit * qty;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, hashtext(${`fan:${normalizedSku}:${channel}`})::int)`;

    const userRow = await tx.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true, fanCredits: true },
    });
    const balanceBefore = Number(userRow?.blkBalance ?? 0);
    if (!userRow || balanceBefore < totalPrice) {
      throw new Error(FAN_ERROR_MESSAGE.INSUFFICIENT_BALANCE);
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        blkBalance: { decrement: totalPrice },
        fanCredits: { increment: creditsGranted },
      },
      select: { blkBalance: true, fanCredits: true },
    });

    return {
      newBalance: Number(updated.blkBalance ?? 0),
      fanCredits: Math.max(0, Number(updated.fanCredits ?? 0)),
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
