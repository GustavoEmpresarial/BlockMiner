import prisma from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import {
  isPartRarity,
  isPartSlug,
  PART_RARITIES,
  type PartRarity,
  type PartSlug,
} from "./parts.catalog.js";
import { PARTS_ERROR_CODE } from "./parts.errors.js";

export const PARTS_CRAFT_RATIO = 5;

export function getNextPartRarity(rarity: PartRarity): PartRarity | null {
  const idx = PART_RARITIES.indexOf(rarity);
  if (idx < 0 || idx >= PART_RARITIES.length - 1) return null;
  return PART_RARITIES[idx + 1];
}

export type CraftPartsResult = {
  ok: true;
  partSlug: PartSlug;
  fromRarity: PartRarity;
  targetRarity: PartRarity;
  consumed: number;
  crafted: number;
  fromQuantity: number;
  targetQuantity: number;
};

export async function craftPartsForUser(
  userId: number,
  rawSlug: unknown,
  rawFromRarity: unknown,
  rawCount: unknown = 1,
): Promise<CraftPartsResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpStatusError(401, "Não autenticado.", { code: "UNAUTHORIZED" });
  }

  const partSlug = String(rawSlug ?? "").trim();
  if (!isPartSlug(partSlug)) {
    throw new HttpStatusError(400, "Peça inválida.", { code: PARTS_ERROR_CODE.INVALID_PARTS_CRAFT });
  }

  const fromRarity = String(rawFromRarity ?? "").trim();
  if (!isPartRarity(fromRarity)) {
    throw new HttpStatusError(400, "Raridade inválida.", { code: PARTS_ERROR_CODE.INVALID_PARTS_CRAFT });
  }

  const targetRarity = getNextPartRarity(fromRarity);
  if (!targetRarity) {
    throw new HttpStatusError(400, "Esta peça já está na raridade máxima.", {
      code: PARTS_ERROR_CODE.MAX_LEVEL_REACHED,
    });
  }

  const countNum = Number(rawCount);
  const count = Number.isInteger(countNum) && countNum > 0 ? Math.min(countNum, 10_000) : 1;
  const needed = count * PARTS_CRAFT_RATIO;

  return prisma.$transaction(async (tx) => {
    // Advisory lock per user for parts mutation
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, 888888::int)`;

    const sourceStack = await tx.userPartStack.findUnique({
      where: {
        userId_partSlug_rarity: {
          userId,
          partSlug,
          rarity: fromRarity,
        },
      },
    });

    const currentFromQty = sourceStack?.quantity ?? 0;
    if (currentFromQty < needed) {
      throw new HttpStatusError(
        400,
        `Você precisa de pelo menos ${needed} peças de ${partSlug} (${fromRarity}) para fundir ${count}x (${targetRarity}).`,
        { code: PARTS_ERROR_CODE.INSUFFICIENT_PARTS },
      );
    }

    // 1. Decrement source stack
    const updatedSource = await tx.userPartStack.update({
      where: {
        userId_partSlug_rarity: {
          userId,
          partSlug,
          rarity: fromRarity,
        },
      },
      data: {
        quantity: { decrement: needed },
      },
    });

    // 2. Increment / Upsert target stack
    const updatedTarget = await tx.userPartStack.upsert({
      where: {
        userId_partSlug_rarity: {
          userId,
          partSlug,
          rarity: targetRarity,
        },
      },
      create: {
        userId,
        partSlug,
        rarity: targetRarity,
        quantity: count,
      },
      update: {
        quantity: { increment: count },
      },
    });

    return {
      ok: true,
      partSlug: partSlug as PartSlug,
      fromRarity: fromRarity as PartRarity,
      targetRarity,
      consumed: needed,
      crafted: count,
      fromQuantity: updatedSource.quantity,
      targetQuantity: updatedTarget.quantity,
    };
  });
}
