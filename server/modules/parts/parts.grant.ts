/**
 * Offerwall part drops share the credit transaction. A repeated sourceRef is a no-op.
 * Chargeback reverses that grant and floors the stack at zero. Missing grants (credits
 * from before this feature) are left alone.
 */
import type { Prisma } from "@prisma/client";
import type { TxClient } from "../../core/database/prisma.js";
import { PART_RARITY, type PartRarity, type PartSlug } from "./parts.catalog.js";
import {
  calculateActivityPartDrop,
  calculateOfferwallPartDrop,
  partSlugForOfferwallCredit,
  type ActivityPartGrantSource,
  type PartGrantSource,
} from "./parts.drop.js";

export type PartGrantArgs = {
  userId: number;
  source: PartGrantSource;
  sourceRef: string;
  usdAmount?: number | Prisma.Decimal | null;
  /** Test override. When provided, overrides the probabilistic drop calculator. */
  quantity?: number;
};

export type PartDropPayload = {
  partSlug: PartSlug;
  rarity: PartRarity;
  quantity: number;
};

export type PartGrantResult = {
  granted: boolean;
  partSlug: PartSlug | null;
  rarity: PartRarity | null;
  quantity: number;
};

export function partDropPayload(result: PartGrantResult): PartDropPayload | null {
  if (!result.granted || result.partSlug == null || result.rarity == null || result.quantity <= 0) return null;
  return { partSlug: result.partSlug, rarity: result.rarity, quantity: result.quantity };
}

export async function grantOfferwallPartInTx(
  tx: TxClient,
  args: PartGrantArgs,
): Promise<PartGrantResult> {
  const sourceRef = String(args.sourceRef ?? "").trim();
  if (!sourceRef) {
    return { granted: false, partSlug: null, rarity: null, quantity: 0 };
  }

  const existing = await tx.partGrant.findUnique({
    where: { source_sourceRef: { source: args.source, sourceRef } },
  });
  if (existing) {
    return {
      granted: false,
      partSlug: existing.partSlug as PartSlug,
      rarity: (existing.rarity as PartRarity | undefined) ?? PART_RARITY.common,
      quantity: existing.quantity,
    };
  }

  let quantity: number;
  let partSlug: PartSlug;

  if (args.quantity !== undefined) {
    quantity = args.quantity;
    partSlug = partSlugForOfferwallCredit(args.source, sourceRef);
  } else {
    const drop = calculateOfferwallPartDrop(args.source, sourceRef, Number(args.usdAmount ?? 0));
    quantity = drop.quantity;
    partSlug = drop.partSlug;
  }

  if (quantity <= 0) {
    return { granted: false, partSlug: null, rarity: null, quantity: 0 };
  }

  const rarity = PART_RARITY.common;
  await tx.partGrant.create({
    data: {
      userId: args.userId,
      partSlug,
      rarity,
      quantity,
      source: args.source,
      sourceRef,
    },
  });
  await tx.userPartStack.upsert({
    where: { userId_partSlug_rarity: { userId: args.userId, partSlug, rarity } },
    create: { userId: args.userId, partSlug, rarity, quantity },
    update: { quantity: { increment: quantity } },
  });
  return { granted: true, partSlug, rarity, quantity };
}

export async function grantActivityPartInTx(
  tx: TxClient,
  args: {
    userId: number;
    source: ActivityPartGrantSource;
    sourceRef: string;
    /** Test override for PARTS_ACTIVITY_DROP_BASE_BPS. Production callers omit it. */
    baseBps?: number;
  },
): Promise<PartGrantResult> {
  const sourceRef = String(args.sourceRef ?? "").trim();
  if (!sourceRef) return { granted: false, partSlug: null, rarity: null, quantity: 0 };

  const drop = calculateActivityPartDrop(args.source, sourceRef, args.baseBps);
  if (!drop.dropped) return { granted: false, partSlug: null, rarity: null, quantity: 0 };

  return grantOfferwallPartInTx(tx, {
    userId: args.userId,
    source: args.source,
    sourceRef,
    quantity: drop.quantity,
  });
}

export async function reverseOfferwallPartInTx(
  tx: TxClient,
  args: { source: PartGrantSource; sourceRef: string },
): Promise<{ reversed: boolean }> {
  const sourceRef = String(args.sourceRef ?? "").trim();
  if (!sourceRef) return { reversed: false };

  const grant = await tx.partGrant.findUnique({
    where: { source_sourceRef: { source: args.source, sourceRef } },
  });
  if (!grant || grant.reversedAt) return { reversed: false };

  await tx.partGrant.update({
    where: { id: grant.id },
    data: { reversedAt: new Date() },
  });

  const rarity = (grant.rarity as PartRarity | undefined) ?? PART_RARITY.common;
  const stack = await tx.userPartStack.findUnique({
    where: { userId_partSlug_rarity: { userId: grant.userId, partSlug: grant.partSlug, rarity } },
  });
  if (!stack) return { reversed: true };

  const next = Math.max(0, stack.quantity - grant.quantity);
  await tx.userPartStack.update({
    where: { id: stack.id },
    data: { quantity: next },
  });
  return { reversed: true };
}
