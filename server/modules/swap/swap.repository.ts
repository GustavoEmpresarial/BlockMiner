import type { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";

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
  tx: TxClient,
  userId: number,
): Promise<SwapBalancesRow | null> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  return tx.user.findUnique({
    where: { id: userId },
    select: { polBalance: true, shibBalance: true, blkBalance: true },
  });
}

export async function updatePolToBlkTx(
  tx: TxClient,
  userId: number,
  amountNum: number,
  output: number,
): Promise<SwapBalancesRow> {
  return tx.user.update({
    where: { id: userId },
    data: {
      polBalance: { decrement: amountNum },
      blkBalance: { increment: output },
    },
    select: { polBalance: true, shibBalance: true, blkBalance: true },
  });
}

export async function updateShibToBlkTx(
  tx: TxClient,
  userId: number,
  amountNum: number,
  output: number,
): Promise<SwapBalancesRow> {
  return tx.user.update({
    where: { id: userId },
    data: {
      shibBalance: { decrement: amountNum },
      blkBalance: { increment: output },
    },
    select: { polBalance: true, shibBalance: true, blkBalance: true },
  });
}

export async function createSwapTransactionTx(
  tx: TxClient,
  userId: number,
  fromAsset: string,
  amountNum: number,
  rate: number,
  output: number,
): Promise<void> {
  await tx.transaction.create({
    data: {
      userId,
      type: "swap",
      amount: amountNum,
      status: "completed",
      completedAt: new Date(),
      usdRateAtConfirmation: rate,
      usdValueAtConfirmation: output,
    },
  });
}
