/**
 * Parts pricing and purchasing for shop and offers.
 * Ponytail: Fixed rate tiers per rarity, atomic PostgreSQL advisory transaction.
 */
import prisma from "../../core/database/prisma.js";
import { miningEngine } from "../mining/index.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import {
  PART_SLUGS,
  PART_RARITIES,
  isPartSlug,
  isPartRarity,
  partImageUrl,
  type PartSlug,
  type PartRarity,
} from "./parts.catalog.js";
import { PARTS_ERROR_CODE } from "./parts.errors.js";

export const PART_SHOP_PRICES: Record<PartRarity, number> = {
  common: 0.002,
  uncommon: 0.01,
  rare: 0.05,
  epic: 0.22,
  legendary: 1.0,
};

export const PART_OFFER_PRICES: Record<PartRarity, number> = {
  common: 0.0015,
  uncommon: 0.0075,
  rare: 0.038,
  epic: 0.17,
  legendary: 0.75,
};

export type PartPackItem = {
  slug: PartSlug;
  rarity: PartRarity;
  quantity: number;
};

export type PartPackDef = {
  id: string;
  nameKey: string;
  descriptionKey: string;
  price: number;
  currency: string;
  badgeKey?: string;
  items: PartPackItem[];
};

export const PART_OFFER_PACKS: readonly PartPackDef[] = [
  {
    id: "starter_pack",
    nameKey: "parts.packs.starter_name",
    descriptionKey: "parts.packs.starter_desc",
    price: 0.04,
    currency: "BLK",
    badgeKey: "parts.packs.starter_badge",
    items: PART_SLUGS.map((slug) => ({ slug, rarity: "common" as PartRarity, quantity: 5 })),
  },
  {
    id: "advanced_pack",
    nameKey: "parts.packs.advanced_name",
    descriptionKey: "parts.packs.advanced_desc",
    price: 0.1,
    currency: "BLK",
    badgeKey: "parts.packs.advanced_badge",
    items: [
      { slug: "power_cable", rarity: "uncommon", quantity: 3 },
      { slug: "asic_chip", rarity: "uncommon", quantity: 3 },
      { slug: "cooling_fan", rarity: "uncommon", quantity: 3 },
      { slug: "hashboard", rarity: "uncommon", quantity: 2 },
      { slug: "power_supply", rarity: "uncommon", quantity: 2 },
      { slug: "thermal_pad", rarity: "uncommon", quantity: 2 },
    ],
  },
];

export type PartCatalogItem = {
  slug: PartSlug;
  rarity: PartRarity;
  nameKey: string;
  price: number;
  listPrice: number;
  currency: string;
  imageUrl: string;
};

export function listPartsCatalogForShop(): PartCatalogItem[] {
  return PART_SLUGS.flatMap((slug) =>
    PART_RARITIES.map((rarity) => ({
      slug,
      rarity,
      nameKey: `parts.items.${slug}`,
      price: PART_SHOP_PRICES[rarity],
      listPrice: PART_SHOP_PRICES[rarity],
      currency: "BLK",
      imageUrl: partImageUrl(slug, rarity),
    })),
  );
}

export function listPartsCatalogForOffer(): PartCatalogItem[] {
  return PART_SLUGS.flatMap((slug) =>
    PART_RARITIES.map((rarity) => ({
      slug,
      rarity,
      nameKey: `parts.items.${slug}`,
      price: PART_OFFER_PRICES[rarity],
      listPrice: PART_SHOP_PRICES[rarity],
      currency: "BLK",
      imageUrl: partImageUrl(slug, rarity),
    })),
  );
}

export function buildActivePartOffersPayload() {
  return {
    titleKey: "parts.offers.title",
    descriptionKey: "parts.offers.desc",
    isLive: true,
    currency: "BLK",
    items: listPartsCatalogForOffer(),
    packs: PART_OFFER_PACKS,
  };
}

export type PurchasePartArgs = {
  userId: number;
  slug: string;
  rarity: string;
  quantity: number;
  channel?: "shop" | "offer";
};

export async function purchasePartForUser(args: PurchasePartArgs) {
  const { userId, channel = "shop" } = args;
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpStatusError(401, "Não autenticado.", { code: "UNAUTHORIZED" });
  }

  const slug = String(args.slug ?? "").trim();
  if (!isPartSlug(slug)) {
    throw new HttpStatusError(400, "Peça inválida.", { code: PARTS_ERROR_CODE.INVALID_PARTS_CRAFT });
  }

  const rarity = String(args.rarity ?? "").trim();
  if (!isPartRarity(rarity)) {
    throw new HttpStatusError(400, "Raridade inválida.", { code: PARTS_ERROR_CODE.INVALID_PARTS_CRAFT });
  }

  const quantity = Math.floor(Number(args.quantity) || 0);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
    throw new HttpStatusError(400, "Quantidade inválida (1 - 10000).", { code: "INVALID_QUANTITY" });
  }

  const unitPrice = channel === "offer" ? PART_OFFER_PRICES[rarity] : PART_SHOP_PRICES[rarity];
  const totalPrice = Math.round(unitPrice * quantity * 100_000_000) / 100_000_000;

  return prisma
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, hashtext(${`part:${slug}:${rarity}`})::int)`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { blkBalance: true },
      });
      const balanceBefore = Number(user?.blkBalance ?? 0);
      if (!user || balanceBefore < totalPrice) {
        throw new HttpStatusError(400, "Saldo BLK insuficiente.", { code: "INSUFFICIENT_BALANCE" });
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { blkBalance: { decrement: totalPrice } },
        select: { blkBalance: true },
      });

      const stack = await tx.userPartStack.upsert({
        where: { userId_partSlug_rarity: { userId, partSlug: slug, rarity } },
        create: { userId, partSlug: slug, rarity, quantity },
        update: { quantity: { increment: quantity } },
        select: { quantity: true },
      });

      return {
        ok: true as const,
        slug,
        rarity,
        quantity,
        unitPrice,
        totalPrice,
        currency: "BLK",
        newBalance: Number(updatedUser.blkBalance ?? 0),
        totalOwnedQuantity: stack.quantity,
      };
    })
    .then(async (res) => {
      try {
        await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
      } catch {
        /* best-effort resync */
      }
      return res;
    });
}

export async function purchasePartPackForUser(userId: number, packId: string) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpStatusError(401, "Não autenticado.", { code: "UNAUTHORIZED" });
  }
  const pack = PART_OFFER_PACKS.find((p) => p.id === packId);
  if (!pack) {
    throw new HttpStatusError(400, "Pacote de peças não encontrado.", { code: "PACK_NOT_FOUND" });
  }

  const totalPrice = pack.price;

  return prisma
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, hashtext(${`pack:${packId}`})::int)`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { blkBalance: true },
      });
      const balanceBefore = Number(user?.blkBalance ?? 0);
      if (!user || balanceBefore < totalPrice) {
        throw new HttpStatusError(400, "Saldo BLK insuficiente.", { code: "INSUFFICIENT_BALANCE" });
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { blkBalance: { decrement: totalPrice } },
        select: { blkBalance: true },
      });

      for (const item of pack.items) {
        await tx.userPartStack.upsert({
          where: { userId_partSlug_rarity: { userId, partSlug: item.slug, rarity: item.rarity } },
          create: { userId, partSlug: item.slug, rarity: item.rarity, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });
      }

      return {
        ok: true as const,
        packId: pack.id,
        nameKey: pack.nameKey,
        totalPrice,
        currency: "BLK",
        newBalance: Number(updatedUser.blkBalance ?? 0),
        itemsGranted: pack.items,
      };
    })
    .then(async (res) => {
      try {
        await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
      } catch {
        /* best-effort resync */
      }
      return res;
    });
}
