import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { grantPurchasedInventoryItems } from "../inventory/inventory.service.js";
import { normalizePersistableMinerImageUrl } from "../inventory/inventory.types.js";
import { miningEngine } from "../mining/index.js";
import { SHOP_CURRENCY } from "../shop/shop.config.js";
import * as shopRepo from "../shop/shop.repository.js";
import { PARTS_ERROR_CODE } from "./parts.errors.js";
import {
  MERGE_OWNED_CATALOG_WHERE,
  MERGE_OWNED_MACHINE_WHERE,
  MERGE_MACHINE_SOURCE,
  type MergeMachineSource,
  isMergeableOfferMiner,
  PARTS_MERGE_ACQUISITION_SOURCE,
  type MergePlate,
  parseMergePlates,
  spendMergePlatesInTx,
  mergedHashRate,
  mergeFeeBlk,
} from "./parts.merge.js";
import {
  MACHINE_MERGE_TIERS,
  MAX_MERGE_LEVEL,
  calculateMergedHashrate,
  getTierForLevel,
  levelOneHashrateFromOwned,
} from "./parts.merge-tiers.js";
import {
  MERGE_PAYMENT_BALANCE_FIELD,
  type MergePaymentAsset,
  parseMergePaymentAsset,
  quoteMergeFee,
} from "./parts.merge-payment.js";
import { getPolUsdPrice, getShibUsdPrice } from "../../shared/cryptoPrice/cryptoPrice.js";
import { invalidateBalanceCache } from "../wallet/balance/balance.service.js";
import { invalidateAuthUserCache } from "../../shared/security/authUser.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/tournaments.actions.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("PartsMerge");

export type PartsMergeResult = {
  mergeId: string;
  source: MergeMachineSource;
  minerId: number;
  name: string;
  level: number;
  tier: string;
  basePrice: number;
  mergeFeeBlk: number;
  paymentAsset: MergePaymentAsset;
  feePercent: number;
  feeAmount: number;
  baseHashRate: number;
  mergedHashRate: number;
  currency: typeof SHOP_CURRENCY;
  blkBalance: number;
};

type MergeModel = {
  name: string;
  slug: string | null;
  imageUrl: string | null;
  basePrice: number;
  baseHashRate: number;
  slotSize: number;
};

async function loadMergeModelTx(tx: TxClient, source: MergeMachineSource, id: number): Promise<MergeModel | null> {
  if (source === MERGE_MACHINE_SOURCE.offer) {
    const em = await tx.eventMiner.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        modelUrl: true,
        price: true,
        hashRate: true,
        slotSize: true,
        isFree: true,
        event: { select: { deletedAt: true } },
      },
    });
    if (!em || !isMergeableOfferMiner(em)) return null;
    return {
      name: em.name,
      slug: null,
      imageUrl: em.imageUrl,
      basePrice: Number(em.price || 0),
      baseHashRate: Number(em.hashRate || 0),
      slotSize: Number(em.slotSize || 1),
    };
  }
  const miner = await tx.miner.findFirst({ where: { id, ...MERGE_OWNED_CATALOG_WHERE } });
  if (!miner) return null;
  return {
    name: miner.name,
    slug: miner.slug,
    imageUrl: miner.imageUrl,
    basePrice: Number(miner.price || 0),
    baseHashRate: Number(miner.baseHashRate || 0),
    slotSize: Number(miner.slotSize || 1),
  };
}

function reject(status: number, message: string, code: string): never {
  throw new HttpStatusError(status, message, { code });
}

export async function mergeMachineForUser(
  userId: number,
  minerId: number,
  rawPlates?: unknown,
  rawSource?: unknown,
  rawLevel?: unknown,
  rawPaymentAsset?: unknown,
): Promise<PartsMergeResult> {
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(minerId) || minerId <= 0) {
    reject(400, "This machine is not available.", PARTS_ERROR_CODE.INVALID_MINER);
  }

  const levelInput = Number(rawLevel);
  const currentLevel = Number.isInteger(levelInput) && levelInput >= 1 && levelInput < MAX_MERGE_LEVEL ? levelInput : 1;

  // Execute 2-identical-machines fusion (RollerCoin model)
  const paymentAsset = parseMergePaymentAsset(rawPaymentAsset);
  const usdPrices =
    paymentAsset === "BLK"
      ? { POL: 0, SHIB: 0 }
      : { POL: await getPolUsdPrice().catch(() => 0), SHIB: await getShibUsdPrice().catch(() => 0) };

  const source = rawSource === MERGE_MACHINE_SOURCE.offer ? MERGE_MACHINE_SOURCE.offer : MERGE_MACHINE_SOURCE.catalog;
  const result = await mergeOwnedMachinesTx(userId, minerId, source, currentLevel, paymentAsset, usdPrices);

  invalidateBalanceCache(userId);
  invalidateAuthUserCache(userId);

  const points = getTierForLevel(result.level).tournamentPoints;
  if (points > 0) {
    void recordTournamentAction({
      userId,
      provider: TOURNAMENT_ACTION_PROVIDER.MERGE,
      actionCount: points,
      executedAtUTC: new Date(),
      providerEventId: `merge:${result.mergeId}`,
      metadata: { minerId, source: result.source, toLevel: result.level, tier: result.tier },
    }).catch((err) => {
      log.warn("parts.merge.tournament_action_failed", { userId, error: String(err) });
    });
  }

  try {
    await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
  } catch {
    /* engine cache resync is best-effort */
  }

  return result;
}

async function mergeOwnedMachinesTx(
  userId: number,
  minerId: number,
  source: MergeMachineSource,
  currentLevel: number,
  paymentAsset: MergePaymentAsset,
  usdPrices: { POL: number; SHIB: number },
): Promise<PartsMergeResult> {
  return prisma.$transaction(async (tx) => {
    const lockKey = source === MERGE_MACHINE_SOURCE.offer ? -minerId : minerId;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${lockKey}::int)`;

    if (currentLevel >= MAX_MERGE_LEVEL) {
      reject(400, "Esta máquina já está no nível máximo (Lendário).", PARTS_ERROR_CODE.MAX_LEVEL_REACHED);
    }

    const targetLevel = currentLevel + 1;
    const targetTierDef = getTierForLevel(targetLevel);

    // 1. Resolve the machine model (shop catalog or offer event)
    const miner = await loadMergeModelTx(tx, source, minerId);
    if (!miner) {
      reject(404, "Esta máquina não está disponível para fusão.", PARTS_ERROR_CODE.MINER_UNAVAILABLE);
    }

    // 2. Find 2 owned machines of this model and level
    const ownedMatches = await tx.userOwnedMachine.findMany({
      where: {
        userId,
        ...(source === MERGE_MACHINE_SOURCE.offer ? { eventMinerId: minerId } : { minerId }),
        level: currentLevel,
        ...MERGE_OWNED_MACHINE_WHERE,
      },
      select: {
        id: true,
        location: true,
        minerId: true,
        hashRate: true,
      },
      orderBy: { hashRate: "asc" },
      take: 2,
    });

    if (ownedMatches.length < 2) {
      reject(400, "Você precisa de pelo menos 2 máquinas idênticas deste nível para fundir.", PARTS_ERROR_CODE.INSUFFICIENT_MACHINES);
    }

    const basePrice = miner.basePrice;
    const baseHashRate = miner.baseHashRate;
    const slotSize = miner.slotSize;
    const quote = quoteMergeFee(basePrice, paymentAsset, usdPrices);
    if (!quote) {
      reject(409, `Cotação de ${paymentAsset} indisponível no momento. Tente pagar em BLK.`, PARTS_ERROR_CODE.PRICE_UNAVAILABLE);
    }
    const fee = quote.feeUsd;
    const consumedHashRates = ownedMatches.map((m) => Number(m.hashRate)).filter((h) => Number.isFinite(h) && h > 0);
    const consumedHashRate = consumedHashRates.length > 0 ? Math.min(...consumedHashRates) : baseHashRate;
    const boostedHashRate = calculateMergedHashrate(
      levelOneHashrateFromOwned(consumedHashRate, currentLevel),
      targetLevel,
    );

    // 3. Check and deduct required parts for this tier
    for (const req of targetTierDef.partsRequired) {
      const updated = await tx.userPartStack.updateMany({
        where: {
          userId,
          partSlug: req.slug,
          rarity: req.rarity,
          quantity: { gte: req.required },
        },
        data: {
          quantity: { decrement: req.required },
        },
      });

      if (updated.count !== 1) {
        reject(400, `Faltam peças de ${req.slug} (${req.rarity}) para esta fusão.`, PARTS_ERROR_CODE.INSUFFICIENT_PARTS);
      }
    }

    // 4. Charge the forge fee in the chosen asset
    if (quote.amount > 0) {
      const field = MERGE_PAYMENT_BALANCE_FIELD[paymentAsset];
      const debited = await tx.user.updateMany({
        where: { id: userId, [field]: { gte: quote.amount } },
        data: { [field]: { decrement: quote.amount } },
      });
      if (debited.count !== 1) {
        reject(409, `Saldo em ${paymentAsset} insuficiente para pagar a taxa da forja.`, PARTS_ERROR_CODE.INSUFFICIENT_BALANCE);
      }
      await tx.transaction.create({
        data: {
          userId,
          type: "merge_fee",
          amount: quote.amount,
          rawTx: JSON.stringify({
            asset: paymentAsset.toLowerCase(),
            feePercent: quote.feePercent,
            feeUsd: quote.feeUsd,
            minerId,
            source,
            minerName: miner.name,
            fromLevel: currentLevel,
            toLevel: targetLevel,
          }),
          status: "completed",
          completedAt: new Date(),
          usdRateAtConfirmation: quote.usdPrice,
          usdValueAtConfirmation: quote.feeUsd,
        },
      });
    }

    // 5. Consume the 2 input machines cleanly
    const machineIds = [ownedMatches[0].id, ownedMatches[1].id];

    // Unrack if installed on racks
    const rackMiners = await tx.userMiner.findMany({
      where: { ownedMachineId: { in: machineIds }, userId },
      select: { id: true },
    });
    if (rackMiners.length > 0) {
      const rackMinerIds = rackMiners.map((r) => r.id);
      await tx.userRack.updateMany({
        where: { userMinerId: { in: rackMinerIds } },
        data: { userMinerId: null, installedAt: null },
      });
      await tx.userRack.updateMany({
        where: { blockedByMinerId: { in: rackMinerIds } },
        data: { blockedByMinerId: null },
      });
    }

    await tx.userMiner.deleteMany({ where: { ownedMachineId: { in: machineIds } } });
    await tx.userInventory.deleteMany({ where: { ownedMachineId: { in: machineIds } } });
    await tx.userVault.deleteMany({ where: { ownedMachineId: { in: machineIds } } });
    await tx.salaTileMiner.deleteMany({ where: { userOwnedMachineId: { in: machineIds }, userId } });
    await tx.userOwnedMachine.deleteMany({ where: { id: { in: machineIds }, userId } });

    // 6. Grant the newly forged upgraded machine
    await grantPurchasedInventoryItems(
      tx,
      userId,
      {
        minerId: source === MERGE_MACHINE_SOURCE.offer ? null : minerId,
        eventMinerId: source === MERGE_MACHINE_SOURCE.offer ? minerId : null,
        minerName:
          source === MERGE_MACHINE_SOURCE.offer
            ? `[Event] ${miner.name} (${targetTierDef.name})`
            : `${miner.name} (${targetTierDef.name})`,
        level: targetLevel,
        hashRate: boostedHashRate,
        slotSize,
        imageUrl: normalizePersistableMinerImageUrl(miner.imageUrl),
        snapshotSlug: miner.slug,
        snapshotPrice: fee,
        acquisitionSource: PARTS_MERGE_ACQUISITION_SOURCE,
      },
      1,
      new Date(),
    );

    const userAfter = await tx.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true },
    });

    return {
      // The consumed machine ids are deleted here, so the lower one identifies this merge forever.
      mergeId: `${Math.min(...machineIds)}-${Math.max(...machineIds)}`,
      source,
      minerId,
      name: `${miner.name} (${targetTierDef.name})`,
      level: targetLevel,
      tier: targetTierDef.tier,
      basePrice,
      mergeFeeBlk: fee,
      paymentAsset,
      feePercent: quote.feePercent,
      feeAmount: quote.amount,
      baseHashRate,
      mergedHashRate: boostedHashRate,
      currency: SHOP_CURRENCY,
      blkBalance: Number(userAfter?.blkBalance || 0),
    };
  });
}
