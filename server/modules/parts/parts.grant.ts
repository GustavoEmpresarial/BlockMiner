/**
 * Offerwall part drops share the credit transaction. A repeated sourceRef is a no-op.
 * Chargeback reverses that grant and floors the stack at zero. Missing grants (credits
 * from before this feature) are left alone.
 */
import type { TxClient } from "../../core/database/prisma.js";
import type { PartSlug } from "./parts.catalog.js";
import {
  partSlugForOfferwallCredit,
  readPartsPerOfferwallCredit,
  type PartGrantSource,
} from "./parts.drop.js";

export type PartGrantArgs = {
  userId: number;
  source: PartGrantSource;
  sourceRef: string;
  /** Test override. Production callers omit this and use PARTS_PER_OFFERWALL_CREDIT. */
  quantity?: number;
};

export async function grantOfferwallPartInTx(
  tx: TxClient,
  args: PartGrantArgs,
): Promise<{ granted: boolean; partSlug: PartSlug | null; quantity: number }> {
  const sourceRef = String(args.sourceRef ?? "").trim();
  const quantity = args.quantity ?? readPartsPerOfferwallCredit();
  if (!sourceRef || quantity <= 0) {
    return { granted: false, partSlug: null, quantity: 0 };
  }

  const existing = await tx.partGrant.findUnique({
    where: { source_sourceRef: { source: args.source, sourceRef } },
  });
  if (existing) {
    return { granted: false, partSlug: existing.partSlug as PartSlug, quantity: existing.quantity };
  }

  const partSlug = partSlugForOfferwallCredit(args.source, sourceRef);
  await tx.partGrant.create({
    data: {
      userId: args.userId,
      partSlug,
      quantity,
      source: args.source,
      sourceRef,
    },
  });
  await tx.userPartStack.upsert({
    where: { userId_partSlug: { userId: args.userId, partSlug } },
    create: { userId: args.userId, partSlug, quantity },
    update: { quantity: { increment: quantity } },
  });
  return { granted: true, partSlug, quantity };
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

  const stack = await tx.userPartStack.findUnique({
    where: { userId_partSlug: { userId: grant.userId, partSlug: grant.partSlug } },
  });
  if (!stack) return { reversed: true };

  const next = Math.max(0, stack.quantity - grant.quantity);
  await tx.userPartStack.update({
    where: { id: stack.id },
    data: { quantity: next },
  });
  return { reversed: true };
}
