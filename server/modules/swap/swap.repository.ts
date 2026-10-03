import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export type SwapBalancesRow = {
  polBalance: Prisma.Decimal;
  shibBalance: Prisma.Decimal;
  blkBalance: Prisma.Decimal;
};

export async function findUserBalances(userId: number): Promise<SwapBalancesRow | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { polBalance: true, shibBalance: true, blkBalance: true },
  });
}

export async function findUserBalancesTx(
  tx: Prisma.TransactionClient,
  userId: number,
): Promise<SwapBalancesRow | null> {
  return tx.user.findUnique({
    where: { id: userId },
    select: { polBalance: true, shibBalance: true, blkBalance: true },
  });
}

export async function updatePolToBlkTx(
  tx: Prisma.TransactionClient,
  userId: number,
  amountNum: number,
  output: number,
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      polBalance: { decrement: amountNum },
      blkBalance: { increment: output },
    },
  });
}

export async function updateShibToBlkTx(
  tx: Prisma.TransactionClient,
  userId: number,
  amountNum: number,
  output: number,
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      shibBalance: { decrement: amountNum },
      blkBalance: { increment: output },
    },
  });
}
