import prisma from "../../core/database/prisma.js";
import { SHOP_ELIGIBLE_WHERE } from "../shop/shop.repository.js";
import { PART_CATALOG, isPartSlug, partImageUrl } from "./parts.catalog.js";
import { partCostsForHashRate, priceBandForHashRate } from "./parts.machinePrices.js";

export async function getPartsOverview(userId: number) {
  const [stacks, miners] = await Promise.all([
    prisma.userPartStack.findMany({
      where: { userId },
      select: { partSlug: true, quantity: true },
    }),
    prisma.miner.findMany({
      where: SHOP_ELIGIBLE_WHERE,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        imageUrl: true,
        baseHashRate: true,
      },
    }),
  ]);

  const owned = new Map<string, number>();
  for (const stack of stacks) {
    owned.set(stack.partSlug, Math.max(0, stack.quantity));
  }

  return {
    parts: PART_CATALOG.map((part) => ({
      slug: part.slug,
      imageUrl: partImageUrl(part.slug),
      quantity: owned.get(part.slug) ?? 0,
    })),
    machines: miners.map((miner) => ({
      id: miner.id,
      slug: miner.slug,
      name: miner.name,
      imageUrl: miner.imageUrl,
      baseHashRate: miner.baseHashRate,
      band: priceBandForHashRate(miner.baseHashRate),
      costs: partCostsForHashRate(miner.baseHashRate).map((cost) => ({
        slug: cost.slug,
        required: cost.required,
        owned: isPartSlug(cost.slug) ? (owned.get(cost.slug) ?? 0) : 0,
      })),
    })),
  };
}
