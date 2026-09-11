/**
 * Ported from legacy/server/modules/shop/application/shop.service.ts.
 *
 * Deviation (item 86, was documented as an open gap, now closed for the sensitive path):
 * legacy wraps this transaction with `advisoryXactTryLockOrThrow` + `lockUserRowForUpdate`
 * (Postgres advisory + row locks) before the `$transaction`. That full lock infra still
 * hasn't landed in current/server/core, but this transaction specifically had a real,
 * confirmed-exploitable race (same class as offer-events.service.ts's item-85 fix): the
 * `maxPerUser` check read `countUserOwnedMachinesForMinerTx` with no guard, so two
 * concurrent purchase requests from the same user could both read a count below the
 * limit before either committed, both pass, and the user ends up owning more than
 * `maxPerUser` machines. Fixed with a scoped `pg_advisory_xact_lock(userId, minerId)` at
 * the top of this transaction — serializes concurrent purchases from the SAME user for
 * the SAME miner, closing both the per-user-limit race and (as a side effect) narrowing
 * the balance-check race for repeat clicks on the same miner. Stock overselling
 * (`stockTotal`, shared across ALL users) is separately closed via
 * `incrementMinerStockSoldTx`'s compare-and-swap (mirrors offer-events.repository.ts's
 * `incrementSoldCountOptimistic`), since the advisory lock alone doesn't serialize
 * different users buying the same miner.
 *
 * Cross-module note: item creation is delegated to inventory/'s public
 * `grantPurchasedInventoryItems(tx, ...)` — shop/ never touches userInventory/
 * userOwnedMachine tables directly, it only decides price/stock/limit and hands the
 * actual "create N items" work to the module that owns that data.
 */
import prisma from "../../core/database/prisma.js";
import { grantPurchasedInventoryItems } from "../inventory/index.js";
import { normalizePersistableMinerImageUrl } from "../inventory/inventory.types.js";
import { miningEngine } from "../mining/index.js";
import * as shopRepo from "./shop.repository.js";
import { SHOP_ERROR_MESSAGE } from "./shop.errors.js";
import { SHOP_CURRENCY } from "./shop.config.js";
import { listFanCatalogForShop, readFanSalesAvailableAt } from "../fans/index.js";
import { listRackCatalogForShop, readRackSalesAvailableAt } from "../racks/index.js";

export type MinerPurchaseResult = {
  newBalance: number;
  balanceBefore: number;
  minerName: string;
  unitPrice: number;
  totalPrice: number;
  currency: typeof SHOP_CURRENCY;
};

export async function listMinersForShop(page: number, pageSize: number) {
  const now = new Date();
  const { miners, total } = await shopRepo.listActiveMiners(page, pageSize);
  return {
    total,
    currency: SHOP_CURRENCY,
    fanSalesAvailableAt: readFanSalesAvailableAt().toISOString(),
    rackSalesAvailableAt: readRackSalesAvailableAt().toISOString(),
    fans: listFanCatalogForShop(now),
    racks: listRackCatalogForShop(now),
    items: miners.map((miner) => ({
      id: miner.id,
      name: miner.name,
      baseHashRate: Number(miner.baseHashRate || 0),
      slotSize: Number(miner.slotSize || 1),
      price: Number(miner.price || 0),
      currency: SHOP_CURRENCY,
      imageUrl: normalizePersistableMinerImageUrl(miner.imageUrl) ?? null,
    })),
  };
}

/**
 * Runs the whole purchase as a single DB transaction: re-validates miner
 * availability/stock/per-user-limit/balance against fresh data, decrements balance,
 * grants inventory items (via inventory/'s public API), bumps stockSold.
 * Throws `Error` with one of SHOP_ERROR_MESSAGE — callers match on `error.message`.
 */
export async function executeMinerPurchaseTransaction(
  userId: number,
  minerId: number,
  quantity: number,
  now: Date,
): Promise<MinerPurchaseResult> {
  return prisma.$transaction(async (tx) => {
    // item 86 (corrigido item 93): forma de 2 args é pg_advisory_xact_lock(int4, int4);
    // (bigint, bigint) NÃO existe — ::bigint fazia toda compra na loja dar 500. Ver item 85.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${minerId}::int)`;

    const currentMiner = await shopRepo.findActiveMinerForPurchaseTx(tx, minerId);
    if (!currentMiner) throw new Error(SHOP_ERROR_MESSAGE.MINER_UNAVAILABLE);

    const currentPrice = Number(currentMiner.price || 0);
    const currentTotalPrice = currentPrice * quantity;
    const currentHashRate = Number(currentMiner.baseHashRate || 0);
    const currentSlotSize = Number(currentMiner.slotSize || 1);

    if (
      currentMiner.stockTotal != null &&
      Number(currentMiner.stockSold || 0) + quantity > Number(currentMiner.stockTotal)
    ) {
      // Cheap early exit for the common already-sold-out case — the real guard against
      // concurrent overselling by DIFFERENT users is the compare-and-swap retry loop below,
      // right before the actual write (this check alone is just as racy as before).
      throw new Error(SHOP_ERROR_MESSAGE.OUT_OF_STOCK);
    }
    if (currentMiner.maxPerUser != null) {
      const ownedCount = await shopRepo.countUserOwnedMachinesForMinerTx(tx, userId, minerId);
      if (ownedCount + quantity > Number(currentMiner.maxPerUser)) {
        throw new Error(SHOP_ERROR_MESSAGE.PURCHASE_LIMIT_REACHED);
      }
    }

    const userRow = await shopRepo.findUserForPurchaseTx(tx, userId);
    const balanceBefore = Number(userRow?.blkBalance || 0);
    if (!userRow || balanceBefore < currentTotalPrice) {
      throw new Error(SHOP_ERROR_MESSAGE.INSUFFICIENT_BALANCE);
    }

    const newUser = await shopRepo.decrementUserBalanceTx(tx, userId, currentTotalPrice);

    await grantPurchasedInventoryItems(
      tx,
      userId,
      {
        minerId,
        minerName: currentMiner.name,
        level: 1,
        hashRate: currentHashRate,
        slotSize: currentSlotSize,
        imageUrl: normalizePersistableMinerImageUrl(currentMiner.imageUrl),
        snapshotSlug: currentMiner.slug,
        snapshotPrice: currentPrice,
        acquisitionSource: "shop",
      },
      quantity,
      now,
    );

    if (currentMiner.stockTotal != null) {
      // Compare-and-swap with retry (mirrors offer-events.repository.ts's
      // incrementSoldCountOptimistic) — closes the real oversell race between DIFFERENT
      // users buying the same limited miner concurrently (the advisory lock above only
      // serializes the SAME user).
      let sold = false;
      for (let attempt = 0; attempt < 10 && !sold; attempt += 1) {
        const fresh = attempt === 0 ? currentMiner : await shopRepo.findActiveMinerForPurchaseTx(tx, minerId);
        const freshSold = Number(fresh?.stockSold ?? currentMiner.stockSold ?? 0);
        if (freshSold + quantity > Number(currentMiner.stockTotal)) {
          throw new Error(SHOP_ERROR_MESSAGE.OUT_OF_STOCK);
        }
        sold = await shopRepo.incrementMinerStockSoldTx(tx, minerId, quantity, freshSold);
      }
      if (!sold) throw new Error(SHOP_ERROR_MESSAGE.OUT_OF_STOCK);
    } else {
      await shopRepo.incrementMinerStockSoldTx(tx, minerId, quantity, Number(currentMiner.stockSold || 0));
    }

    return {
      newBalance: Number(newUser.blkBalance || 0),
      balanceBefore,
      minerName: currentMiner.name,
      unitPrice: currentPrice,
      totalPrice: currentTotalPrice,
      currency: SHOP_CURRENCY,
    };
  }).then(async (result) => {
    // Mirror the DB debit into the in-memory mining engine — without this, GET
    // /api/mining/cycle (dashboard's balance card) keeps serving the pre-purchase cached
    // balance forever, since getOrCreateEngineMinerForUser() short-circuits on an existing
    // in-memory miner and never re-reads the DB. Best-effort: the purchase already committed,
    // a reload failure here must not roll it back or fail the request (same doctrine as
    // vault.service.ts's notifyVaultMove).
    try {
      await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
    } catch {
      /* engine cache resync is best-effort — DB is already the source of truth */
    }
    return result;
  });
}
