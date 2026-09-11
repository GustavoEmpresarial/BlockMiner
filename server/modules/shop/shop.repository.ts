/**
 * Ported from legacy/server/modules/shop/infrastructure/repositories/shop.repository.ts
 * + legacy/server/models/minersModel.ts (listActiveMiners/getActiveMinerById query shape).
 */
import type { TxClient } from "../../core/database/prisma.js";
import prisma from "../../core/database/prisma.js";

/** Miners eligible for shop listing: active catalog rows, store-sourced, not reserved for faucet/shortlink rewards. */
const SHOP_ELIGIBLE_WHERE = {
  isActive: true,
  showInShop: true,
  isArchived: false,
  sourceType: "store",
  faucetReward: null,
  shortlinkRew: null,
} as const;

export async function listActiveMiners(page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const [miners, total] = await Promise.all([
    prisma.miner.findMany({
      where: SHOP_ELIGIBLE_WHERE,
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.miner.count({ where: SHOP_ELIGIBLE_WHERE }),
  ]);
  return { miners, total };
}

export async function findActiveMinerForPurchaseTx(tx: TxClient, minerId: number) {
  return tx.miner.findFirst({ where: { id: minerId, ...SHOP_ELIGIBLE_WHERE } });
}

export async function countUserOwnedMachinesForMinerTx(tx: TxClient, userId: number, minerId: number): Promise<number> {
  return tx.userOwnedMachine.count({ where: { userId, minerId } });
}

export async function findUserForPurchaseTx(tx: TxClient, userId: number) {
  return tx.user.findUnique({ where: { id: userId } });
}

export async function decrementUserBalanceTx(tx: TxClient, userId: number, amount: number) {
  return tx.user.update({ where: { id: userId }, data: { blkBalance: { decrement: amount } } });
}

/**
 * item 86: compare-and-swap (mesmo padrão de offer-events.repository.ts's
 * `incrementSoldCountOptimistic`) — um `update` incondicional aqui reabriria a mesma
 * janela de corrida que permitiu overselling de estoque no offer-events antes do fix.
 * O `WHERE stockSold: currentStockSold` só confirma se ninguém mexeu no contador entre
 * a leitura em `executeMinerPurchaseTransaction` e este write; se mexeu, falha e o
 * chamador trata como "tente de novo" (a checagem de estoque em si já roda de novo, já
 * que o advisory lock — ver shop.service.ts — serializa por (userId, minerId), então
 * na prática isso só dispara entre USUÁRIOS DIFERENTES disputando o mesmo miner).
 */
export async function incrementMinerStockSoldTx(
  tx: TxClient,
  minerId: number,
  quantity: number,
  currentStockSold: number,
): Promise<boolean> {
  const res = await tx.miner.updateMany({
    where: { id: minerId, stockSold: currentStockSold },
    data: { stockSold: { increment: quantity } },
  });
  return res.count === 1;
}
