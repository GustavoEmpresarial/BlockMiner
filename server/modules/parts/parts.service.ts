import prisma from "../../core/database/prisma.js";
import { SHOP_CURRENCY } from "../shop/shop.config.js";
import { PART_CATALOG, PART_RARITY, isPartRarity, isPartSlug, partImageUrl } from "./parts.catalog.js";
import { partCostsForHashRate, priceBandForHashRate } from "./parts.machinePrices.js";
import {
  MERGE_OWNED_CATALOG_WHERE,
  MERGE_OWNED_MACHINE_WHERE,
  MERGE_MACHINE_SOURCE,
  type MergeMachineSource,
  isMergeableOfferMiner,
  mergeFeeBlk,
  mergedHashRate,
  readMergeFeeBasisPoints,
  readMergeHashrateBoostBasisPoints,
} from "./parts.merge.js";
import {
  MACHINE_MERGE_TIERS,
  MAX_MERGE_LEVEL,
  calculateMergedHashrate,
  levelOneHashrateFromOwned,
  getTierForLevel,
} from "./parts.merge-tiers.js";
import {
  MERGE_CRYPTO_DISCOUNT_POINTS,
  MERGE_FEE_PERCENT_BLK,
  MERGE_FEE_PERCENT_CRYPTO,
  quoteAllMergeFees,
} from "./parts.merge-payment.js";
import { getPolUsdPrice, getShibUsdPrice } from "../../shared/cryptoPrice/cryptoPrice.js";

export async function getPartsOverview(userId: number) {
  const [stacks, miners, offerMiners, user, ownedMachines, polUsd, shibUsd] = await Promise.all([
    prisma.userPartStack.findMany({
      where: { userId },
      select: { partSlug: true, rarity: true, quantity: true },
    }),
    prisma.miner.findMany({
      where: MERGE_OWNED_CATALOG_WHERE,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        imageUrl: true,
        baseHashRate: true,
        price: true,
        isActive: true,
      },
    }),
    prisma.eventMiner.findMany({
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        name: true,
        imageUrl: true,
        modelUrl: true,
        hashRate: true,
        price: true,
        isActive: true,
        isFree: true,
        event: { select: { deletedAt: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true, polBalance: true, shibBalance: true },
    }),
    prisma.userOwnedMachine.findMany({
      where: { userId, ...MERGE_OWNED_MACHINE_WHERE },
      select: {
        id: true,
        minerId: true,
        eventMinerId: true,
        minerName: true,
        level: true,
        hashRate: true,
        imageUrl: true,
        location: true,
      },
    }),
    getPolUsdPrice().catch(() => 0),
    getShibUsdPrice().catch(() => 0),
  ]);

  const ownedParts = new Map<string, number>();
  for (const stack of stacks) {
    const rarity = isPartRarity(stack.rarity) ? stack.rarity : PART_RARITY.common;
    ownedParts.set(`${stack.partSlug}:${rarity}`, Math.max(0, stack.quantity));
  }

  const blkBalance = Number(user?.blkBalance ?? 0);
  const walletBalances = {
    BLK: blkBalance,
    POL: Number(user?.polBalance ?? 0),
    SHIB: Number(user?.shibBalance ?? 0),
  };
  const usdPrices = { POL: Number(polUsd) || 0, SHIB: Number(shibUsd) || 0 };
  type MergeModel = {
    source: MergeMachineSource;
    id: number;
    slug: string | null;
    name: string;
    imageUrl: string | null;
    basePrice: number;
    baseHashRate: number;
  };
  const models = new Map<string, MergeModel>();
  for (const m of miners) {
    models.set(`${MERGE_MACHINE_SOURCE.catalog}:${m.id}`, {
      source: MERGE_MACHINE_SOURCE.catalog,
      id: m.id,
      slug: m.slug,
      name: m.name,
      imageUrl: m.imageUrl,
      basePrice: Number(m.price || 0),
      baseHashRate: Number(m.baseHashRate || 0),
    });
  }
  for (const em of offerMiners) {
    if (!isMergeableOfferMiner(em)) continue;
    models.set(`${MERGE_MACHINE_SOURCE.offer}:${em.id}`, {
      source: MERGE_MACHINE_SOURCE.offer,
      id: em.id,
      slug: null,
      name: em.name,
      imageUrl: em.imageUrl,
      basePrice: Number(em.price || 0),
      baseHashRate: Number(em.hashRate || 0),
    });
  }

  // Group user's owned machines by (source, model, level)
  const ownedGroups = new Map<string, typeof ownedMachines>();
  for (const om of ownedMachines) {
    const modelKey = om.minerId
      ? `${MERGE_MACHINE_SOURCE.catalog}:${om.minerId}`
      : om.eventMinerId
        ? `${MERGE_MACHINE_SOURCE.offer}:${om.eventMinerId}`
        : null;
    if (!modelKey || !models.has(modelKey)) continue;
    const key = `${modelKey}:${om.level || 1}`;
    const list = ownedGroups.get(key) ?? [];
    list.push(om);
    ownedGroups.set(key, list);
  }

  // Every mergeable model is listed, even ones the player does not own yet (0/2).
  const groupKeys = [...ownedGroups.keys()];
  for (const modelKey of models.keys()) {
    if (!groupKeys.some((k) => k.startsWith(`${modelKey}:`))) ownedGroups.set(`${modelKey}:1`, []);
  }

  const ownedMergeCandidates: Array<Record<string, unknown>> = [];
  for (const [key, group] of ownedGroups.entries()) {
    const [source, idStr, levelStr] = key.split(":");
    const currentLevel = Number(levelStr) || 1;
    const miner = models.get(`${source}:${idStr}`);
    if (!miner) continue;

    const basePrice = miner.basePrice;
    const baseHashRate = miner.baseHashRate;
    const ownedCount = group.length;
    const hasMachinePair = ownedCount >= 2;

    const currentTier = getTierForLevel(currentLevel);
    const isMaxLevel = currentLevel >= MAX_MERGE_LEVEL;
    const targetLevel = isMaxLevel ? currentLevel : currentLevel + 1;
    const targetTier = getTierForLevel(targetLevel);

    const feeOptions = isMaxLevel
      ? []
      : quoteAllMergeFees(basePrice, usdPrices).map((q) => ({
          ...q,
          balance: walletBalances[q.asset],
          affordable: Math.round(walletBalances[q.asset] * 100_000_000) >= Math.round(q.amount * 100_000_000),
        }));
    const blkOption = feeOptions.find((o) => o.asset === "BLK");
    const feeBlk = blkOption?.amount ?? 0;
    const ownedHashRates = group.map((g) => Number(g.hashRate)).filter((h) => Number.isFinite(h) && h > 0);
    const currentHashRate = ownedHashRates.length > 0 ? Math.min(...ownedHashRates) : baseHashRate;
    const targetHashRate = isMaxLevel
      ? currentHashRate
      : calculateMergedHashrate(levelOneHashrateFromOwned(currentHashRate, currentLevel), targetLevel);
    const hasBlk = isMaxLevel || feeOptions.some((o) => o.affordable);

    const partsRecipe = targetTier.partsRequired.map((req) => ({
      slug: req.slug,
      rarity: req.rarity,
      required: req.required,
      owned: ownedParts.get(`${req.slug}:${req.rarity}`) ?? 0,
    }));

    const hasParts = !isMaxLevel && partsRecipe.every((p) => p.owned >= p.required);
    const canMerge = !isMaxLevel && hasMachinePair && hasParts && hasBlk;

    ownedMergeCandidates.push({
      id: miner.id,
      minerId: miner.id,
      source: miner.source,
      name: miner.name,
      slug: miner.slug,
      imageUrl: miner.imageUrl,
      baseHashRate,
      currentLevel,
      currentTier: currentTier.tier,
      currentTierName: currentTier.name,
      currentTierColor: currentTier.color,
      currentHashRate,
      ownedCount,
      owned: ownedCount > 0,
      hasMachinePair,
      isMaxLevel,
      targetLevel,
      targetTier: targetTier.tier,
      targetTierName: targetTier.name,
      targetTierColor: targetTier.color,
      targetHashRate,
      boostPercent: targetTier.boostPercent,
      mergeFeeBlk: feeBlk,
      feeOptions,
      hasBlk,
      hasParts,
      canMerge,
      partsRecipe,
    });
  }

  // Sort: mergeable first, then by highest owned count, then by highest hashrate
  ownedMergeCandidates.sort((a, b) => {
    if (a.canMerge !== b.canMerge) return a.canMerge ? -1 : 1;
    if (a.hasMachinePair !== b.hasMachinePair) return a.hasMachinePair ? -1 : 1;
    if (a.owned !== b.owned) return a.owned ? -1 : 1;
    return (Number(b.ownedCount) - Number(a.ownedCount)) || (Number(b.baseHashRate) - Number(a.baseHashRate));
  });

  // Catalog machines for reference & evolution tree (shop-active rows only)
  const catalogMachines = miners.filter((miner) => miner.isActive).flatMap((miner) => {
    const row = toMergeMachine({
      id: miner.id,
      source: MERGE_MACHINE_SOURCE.catalog,
      slug: miner.slug,
      name: miner.name,
      imageUrl: miner.imageUrl,
      baseHashRate: Number(miner.baseHashRate || 0),
      basePrice: Number(miner.price || 0),
      owned: ownedParts,
    });
    return row ? [row] : [];
  });

  return {
    currency: SHOP_CURRENCY,
    blkBalance: Number.isFinite(blkBalance) ? blkBalance : 0,
    walletBalances,
    usdPrices,
    mergeFeePercentBlk: MERGE_FEE_PERCENT_BLK,
    mergeFeePercentCrypto: MERGE_FEE_PERCENT_CRYPTO,
    mergeCryptoDiscountPoints: MERGE_CRYPTO_DISCOUNT_POINTS,
    mergeFeeBasisPoints: readMergeFeeBasisPoints(),
    mergeHashrateBoostBasisPoints: readMergeHashrateBoostBasisPoints(),
    tierDefinitions: MACHINE_MERGE_TIERS,
    ownedMergeCandidates,
    parts: PART_CATALOG.map((part) => ({
      slug: part.slug,
      rarity: part.rarity,
      imageUrl: partImageUrl(part.slug, part.rarity),
      quantity: ownedParts.get(`${part.slug}:${part.rarity}`) ?? 0,
    })),
    machines: catalogMachines,
  };
}

function toMergeMachine(miner: {
  id: number;
  source: typeof MERGE_MACHINE_SOURCE.catalog | typeof MERGE_MACHINE_SOURCE.offer;
  slug: string;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  basePrice: number;
  owned: Map<string, number>;
}) {
  if (
    miner.slug.toLowerCase().startsWith("shortlink-") ||
    miner.name.toLowerCase().includes("shortlink reward")
  ) {
    return null;
  }
  const boosted = mergedHashRate(miner.baseHashRate);
  if (!Number.isFinite(miner.baseHashRate) || boosted <= 0) return null;
  const safePrice = Number.isFinite(miner.basePrice) && miner.basePrice > 0 ? miner.basePrice : 0;
  return {
    id: miner.id,
    source: miner.source,
    slug: miner.slug,
    name: miner.name,
    imageUrl: miner.imageUrl,
    baseHashRate: miner.baseHashRate,
    basePrice: safePrice,
    mergeFeeBlk: mergeFeeBlk(safePrice),
    mergedHashRate: boosted,
    band: priceBandForHashRate(miner.baseHashRate),
    costs: partCostsForHashRate(miner.baseHashRate).map((cost) => ({
      slug: cost.slug,
      required: cost.required,
      owned: isPartSlug(cost.slug) ? (miner.owned.get(`${cost.slug}:${PART_RARITY.common}`) ?? 0) : 0,
    })),
  };
}
