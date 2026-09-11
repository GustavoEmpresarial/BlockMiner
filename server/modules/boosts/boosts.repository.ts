/** Ported from legacy services/powerBoostService.ts — Prisma access for boosts. */
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";

export async function findBoostForDay(userId: number, dayKey: string) {
  return prisma.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { id: true },
  });
}

export async function findBoostForDayTx(tx: TxClient, userId: number, dayKey: string) {
  return tx.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { id: true },
  });
}

export async function findUserTaxBalancesTx(tx: TxClient, userId: number) {
  return tx.user.findUnique({
    where: { id: userId },
    select: { polBalance: true, blkBalance: true, shibBalance: true },
  });
}

export async function findUserPolBalanceTx(tx: TxClient, userId: number) {
  return findUserTaxBalancesTx(tx, userId);
}

export async function decrementUserBalanceTx(
  tx: TxClient,
  userId: number,
  currency: "POL" | "BLK" | "SHIB",
  amount: number,
) {
  const field = currency === "BLK" ? "blkBalance" : currency === "SHIB" ? "shibBalance" : "polBalance";
  return tx.user.update({
    where: { id: userId },
    data: { [field]: { decrement: amount } },
    select: { polBalance: true, blkBalance: true, shibBalance: true },
  });
}

export async function decrementUserPolBalanceTx(tx: TxClient, userId: number, amount: number) {
  return decrementUserBalanceTx(tx, userId, "POL", amount);
}

export async function findUserBalances(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { polBalance: true, blkBalance: true, shibBalance: true },
  });
}

export async function createBoostTx(tx: TxClient, userId: number, dayKey: string, amountPol: number): Promise<void> {
  await tx.dailyPowerBoost.create({ data: { userId, dayKey, amountPol } });
}

export async function createAuditLogTx(
  tx: TxClient,
  userId: number,
  action: string,
  detailsJson: string,
): Promise<void> {
  await tx.auditLog.create({ data: { userId, action, detailsJson } });
}
