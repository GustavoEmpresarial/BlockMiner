import prisma from "../../../core/database/prisma.js";

export async function findUserBalanceRow(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      polBalance: true,
      btcBalance: true,
      ethBalance: true,
      usdtBalance: true,
      usdcBalance: true,
      zerBalance: true,
      blkBalance: true,
      blkLocked: true,
      shibBalance: true,
      miningPayoutMode: true,
      walletAddress: true,
      lifetimeMinedPol: true,
    },
  });
}

export async function sumCompletedWithdrawals(userId: number): Promise<number> {
  const withdrawnAgg = await prisma.transaction.aggregate({
    where: { userId, type: "withdrawal", status: "completed" },
    _sum: { amount: true },
  });
  return Number(withdrawnAgg._sum.amount || 0);
}
