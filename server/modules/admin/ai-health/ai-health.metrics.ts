/**
 * Coleta as métricas reais que alimentam o diagnóstico de saúde (plataforma + usuário).
 * Números batidos manualmente contra a produção em 2026-08-24 (payback da loja, canais
 * gratuitos de hashrate, emissão real por bloco) — ver PROGRESSO.txt / conversa da IA de
 * saúde. Read-only: nenhuma query aqui grava nada.
 */
import prisma from "../../../core/database/prisma.js";
import { readMiningBlockRewardPol, readMiningBlockDurationMs } from "../../mining/mining.config.js";
import { V2_DAILY_LIMIT_HASH } from "../../auto-mining/auto-mining.config.js";

export type AiHealthMetrics = {
  economy: {
    blockRewardPol: number;
    blockDurationMs: number;
    dailyEmissionPol: number;
    networkHashRateHs: number;
    activeMinerRows: number;
    polPerHsPerDay: number;
    shop: Array<{ name: string; hashRate: number; price: number; paybackDays: number | null }>;
    shopAvgPaybackDays: number | null;
    /** Recalculado sempre com os dados reais atuais (preço médio da loja por H/s ÷ hashrate
     * da rede) — recompensa de bloco necessária pra fazer o payback médio da loja cair
     * exatamente em 2 e em 2.5 anos, mantendo o preço da loja como está hoje. */
    idealBlockRewardPolFor2y: number | null;
    idealBlockRewardPolFor2_5y: number | null;
  };
  freeChannels: {
    autoMiningV2DailyCapHsPerUser: number;
    activeUsers24h: number;
    activeUsers7d: number;
    checkinPermanentMachineGrants7d: number;
    checkinPermanentHashRate7d: number;
    /** Mini-games (jogos parceiros): boost de H/s TEMPORÁRIO, some ao expirar — mas conta
     * pro pool de emissão enquanto ativo, competindo com quem comprou máquina de verdade. */
    gamesHashRateGranted7d: number;
    gamesActiveHashRateNow: number;
    gamesActiveHashRateNowSharePct: number;
    gamesEquivalentShopPriceIfBought: number | null;
  };
  platform: {
    totalUsers: number;
    newUsers24h: number;
    newUsers7d: number;
    pendingWithdrawals: number;
    openSupportTickets: number;
  };
  spenders: {
    topShopSpendersPol: Array<{ username: string; totalPol: number; unitsBought: number }>;
    topOfferSpendersPol: Array<{ username: string; totalPol: number; purchases: number }>;
    topDepositorsUsd: Array<{ username: string; totalUsd: number; deposits: number }>;
    totalPolSpentShopAllTime: number;
    totalPolSpentOffersAllTime: number;
    offerEventRevenue: Array<{ eventTitle: string; totalPol: number; purchases: number }>;
    topOfferItems: Array<{ itemName: string; eventTitle: string; totalPol: number; purchases: number }>;
  };
  powerCohorts: {
    /** Conta antiga vs. nova, competindo pelo MESMO pool de 43,2 POL/dia — quem tem mais
     * hashrate leva fatia maior, independente de quando entrou. */
    byAccountAge: Array<{
      cohort: string;
      userCount: number;
      totalHashRateHs: number;
      avgHashRateHsPerUser: number;
      networkSharePct: number;
      estDailyPolPerAvgUser: number;
      estRoiYearsAtShopPrice: number | null;
    }>;
    concentration: {
      totalActiveUsers: number;
      top1PctUserCount: number;
      top1PctHashRateShare: number;
      top10PctUserCount: number;
      top10PctHashRateShare: number;
      bottom50PctHashRateShare: number;
      medianHashRateHs: number;
    };
  };
};

function avgShopPricePerHsFrom(shop: Array<{ hashRate: number; price: number }>): number | null {
  const perHs = shop.filter((s) => s.hashRate > 0).map((s) => s.price / s.hashRate);
  return perHs.length > 0 ? perHs.reduce((a, b) => a + b, 0) / perHs.length : null;
}

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch {
    return 0;
  }
}

export async function gatherAiHealthMetrics(): Promise<AiHealthMetrics> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const blockRewardPol = readMiningBlockRewardPol();
  const blockDurationMs = readMiningBlockDurationMs();
  const blocksPerDay = (24 * 60 * 60 * 1000) / blockDurationMs;
  const dailyEmissionPol = blockRewardPol * blocksPerDay;

  const [networkAgg, shopMiners, activeUsers24h, activeUsers7d, totalUsers, newUsers24h, newUsers7d, checkinGrants7d] =
    await Promise.all([
      prisma.userMiner.aggregate({ where: { isActive: true }, _sum: { hashRate: true }, _count: true }),
      prisma.miner.findMany({
        where: { isActive: true, showInShop: true, price: { gt: 0 } },
        select: { name: true, baseHashRate: true, price: true },
        orderBy: { price: "asc" },
      }),
      safeCount(() =>
        prisma.user.count({ where: { isBanned: false, OR: [{ lastHeartbeatAt: { gte: since24h } }, { lastLoginAt: { gte: since24h } }] } }),
      ),
      safeCount(() =>
        prisma.user.count({ where: { isBanned: false, OR: [{ lastHeartbeatAt: { gte: since7d } }, { lastLoginAt: { gte: since7d } }] } }),
      ),
      safeCount(() => prisma.user.count()),
      safeCount(() => prisma.user.count({ where: { createdAt: { gte: since24h } } })),
      safeCount(() => prisma.user.count({ where: { createdAt: { gte: since7d } } })),
      safeCount(() =>
        prisma.userCheckinStreakReward.count({
          where: { createdAt: { gte: since7d }, milestone: { rewardType: "machine" } },
        }),
      ),
    ]);

  const networkHashRateHs = Number(networkAgg._sum.hashRate ?? 0);
  const activeMinerRows = networkAgg._count;
  const polPerHsPerDay = networkHashRateHs > 0 ? dailyEmissionPol / networkHashRateHs : 0;

  const shop = shopMiners.map((m) => {
    const hashRate = Number(m.baseHashRate);
    const price = Number(m.price);
    const paybackDays = hashRate > 0 && polPerHsPerDay > 0 ? price / (hashRate * polPerHsPerDay) : null;
    return { name: m.name, hashRate, price, paybackDays };
  });
  const validPaybacks = shop.map((s) => s.paybackDays).filter((n): n is number => n != null);
  const shopAvgPaybackDays = validPaybacks.length > 0 ? validPaybacks.reduce((a, b) => a + b, 0) / validPaybacks.length : null;

  const avgShopPricePerHsNow = avgShopPricePerHsFrom(shop);
  const idealBlockRewardPolForTarget = (targetDays: number): number | null =>
    avgShopPricePerHsNow != null && networkHashRateHs > 0
      ? (avgShopPricePerHsNow * networkHashRateHs) / (blocksPerDay * targetDays)
      : null;
  const idealBlockRewardPolFor2y = idealBlockRewardPolForTarget(730);
  const idealBlockRewardPolFor2_5y = idealBlockRewardPolForTarget(912);

  let checkinPermanentHashRate7d = 0;
  try {
    const rows = await prisma.userCheckinStreakReward.findMany({
      where: { createdAt: { gte: since7d }, milestone: { rewardType: "machine" } },
      select: { milestone: { select: { miner: { select: { baseHashRate: true } } } } },
    });
    checkinPermanentHashRate7d = rows.reduce((sum, r) => sum + Number(r.milestone?.miner?.baseHashRate ?? 0), 0);
  } catch {
    checkinPermanentHashRate7d = 0;
  }

  const [pendingWithdrawals, openSupportTickets] = await Promise.all([
    safeCount(() => prisma.transaction.count({ where: { type: "withdrawal", status: "pending" } })),
    safeCount(() => prisma.publicSupportTicket.count({ where: { status: "open" } })),
  ]);

  const [gamesGranted7dAgg, gamesActiveAgg] = await Promise.all([
    prisma.userPowerGame
      .aggregate({ where: { playedAt: { gte: since7d } }, _sum: { hashRate: true } })
      .catch(() => ({ _sum: { hashRate: 0 } })),
    prisma.userPowerGame
      .aggregate({ where: { expiresAt: { gt: now } }, _sum: { hashRate: true } })
      .catch(() => ({ _sum: { hashRate: 0 } })),
  ]);
  const gamesHashRateGranted7d = Number(gamesGranted7dAgg._sum.hashRate ?? 0);
  const gamesActiveHashRateNow = Number(gamesActiveAgg._sum.hashRate ?? 0);

  const spenders = await gatherSpenderMetrics();
  const powerCohorts = await gatherPowerCohortMetrics(polPerHsPerDay, shop);

  return {
    economy: {
      blockRewardPol,
      blockDurationMs,
      dailyEmissionPol,
      networkHashRateHs,
      activeMinerRows,
      polPerHsPerDay,
      shop,
      shopAvgPaybackDays,
      idealBlockRewardPolFor2y,
      idealBlockRewardPolFor2_5y,
    },
    freeChannels: {
      autoMiningV2DailyCapHsPerUser: V2_DAILY_LIMIT_HASH,
      activeUsers24h,
      activeUsers7d,
      checkinPermanentMachineGrants7d: checkinGrants7d,
      checkinPermanentHashRate7d,
      gamesHashRateGranted7d,
      gamesActiveHashRateNow,
      gamesActiveHashRateNowSharePct: networkHashRateHs > 0 ? (gamesActiveHashRateNow / networkHashRateHs) * 100 : 0,
      gamesEquivalentShopPriceIfBought: avgShopPricePerHsFrom(shop) != null ? gamesActiveHashRateNow * avgShopPricePerHsFrom(shop)! : null,
    },
    platform: {
      totalUsers,
      newUsers24h,
      newUsers7d,
      pendingWithdrawals,
      openSupportTickets,
    },
    spenders,
    powerCohorts,
  };
}

const AGE_COHORTS = [
  { label: "0-7 dias (recém-chegados)", maxDays: 7 },
  { label: "7-30 dias", maxDays: 30 },
  { label: "30-90 dias", maxDays: 90 },
  { label: "90-365 dias", maxDays: 365 },
  { label: "365+ dias (veteranos)", maxDays: Infinity },
];

async function gatherPowerCohortMetrics(
  polPerHsPerDay: number,
  shop: Array<{ hashRate: number; price: number }>,
): Promise<AiHealthMetrics["powerCohorts"]> {
  const rows = await prisma.$queryRaw<Array<{ user_id: number; created_at: Date; hash_rate: number }>>`
    SELECT um.user_id, u.created_at, SUM(um.hash_rate) AS hash_rate
    FROM user_miners um
    JOIN users u ON u.id = um.user_id
    WHERE um.is_active = true
    GROUP BY um.user_id, u.created_at
    HAVING SUM(um.hash_rate) > 0
  `;

  const avgShopPricePerHs = avgShopPricePerHsFrom(shop);

  const now = Date.now();
  const totalHashRate = rows.reduce((sum, r) => sum + Number(r.hash_rate), 0);

  const byAccountAge = AGE_COHORTS.map((cohort, i) => {
    const minDays = i === 0 ? 0 : AGE_COHORTS[i - 1]!.maxDays;
    const cohortRows = rows.filter((r) => {
      const ageDays = (now - new Date(r.created_at).getTime()) / (24 * 60 * 60 * 1000);
      return ageDays >= minDays && ageDays < cohort.maxDays;
    });
    const cohortHashRate = cohortRows.reduce((sum, r) => sum + Number(r.hash_rate), 0);
    const avgHashRateHsPerUser = cohortRows.length > 0 ? cohortHashRate / cohortRows.length : 0;
    const estDailyPolPerAvgUser = avgHashRateHsPerUser * polPerHsPerDay;
    const estRoiYearsAtShopPrice =
      avgShopPricePerHs != null && estDailyPolPerAvgUser > 0
        ? (avgHashRateHsPerUser * avgShopPricePerHs) / (estDailyPolPerAvgUser * 365)
        : null;
    return {
      cohort: cohort.label,
      userCount: cohortRows.length,
      totalHashRateHs: cohortHashRate,
      avgHashRateHsPerUser,
      networkSharePct: totalHashRate > 0 ? (cohortHashRate / totalHashRate) * 100 : 0,
      estDailyPolPerAvgUser,
      estRoiYearsAtShopPrice,
    };
  });

  const sorted = [...rows].map((r) => Number(r.hash_rate)).sort((a, b) => b - a);
  const totalActiveUsers = sorted.length;
  const top1PctUserCount = Math.max(1, Math.ceil(totalActiveUsers * 0.01));
  const top10PctUserCount = Math.max(1, Math.ceil(totalActiveUsers * 0.1));
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const top1Sum = sum(sorted.slice(0, top1PctUserCount));
  const top10Sum = sum(sorted.slice(0, top10PctUserCount));
  const bottom50Count = Math.max(1, Math.floor(totalActiveUsers * 0.5));
  const bottom50Sum = sum(sorted.slice(-bottom50Count));
  const medianHashRateHs = totalActiveUsers > 0 ? sorted[Math.floor(totalActiveUsers / 2)]! : 0;

  return {
    byAccountAge,
    concentration: {
      totalActiveUsers,
      top1PctUserCount,
      top1PctHashRateShare: totalHashRate > 0 ? (top1Sum / totalHashRate) * 100 : 0,
      top10PctUserCount,
      top10PctHashRateShare: totalHashRate > 0 ? (top10Sum / totalHashRate) * 100 : 0,
      bottom50PctHashRateShare: totalHashRate > 0 ? (bottom50Sum / totalHashRate) * 100 : 0,
      medianHashRateHs,
    },
  };
}

async function usernamesFor(userIds: number[]): Promise<Map<number, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } });
  return new Map(rows.map((r) => [r.id, r.username ?? `user#${r.id}`]));
}

async function gatherSpenderMetrics(): Promise<AiHealthMetrics["spenders"]> {
  const [shopByUser, offersByUser, depositsByUser, offerRevenueByEvent, offerRevenueByItem] = await Promise.all([
    prisma.userOwnedMachine.groupBy({
      by: ["userId"],
      where: { acquisitionSource: "shop", snapshotPrice: { gt: 0 } },
      _sum: { snapshotPrice: true },
      _count: true,
      orderBy: { _sum: { snapshotPrice: "desc" } },
      take: 10,
    }),
    prisma.eventPurchase.groupBy({
      by: ["userId"],
      _sum: { pricePaid: true },
      _count: true,
      orderBy: { _sum: { pricePaid: "desc" } },
      take: 10,
    }),
    prisma.transaction.groupBy({
      by: ["userId"],
      where: { type: "deposit", status: "completed" },
      _sum: { usdValueAtConfirmation: true },
      _count: true,
      orderBy: { _sum: { usdValueAtConfirmation: "desc" } },
      take: 10,
    }),
    prisma.eventPurchase.groupBy({
      by: ["eventId"],
      _sum: { pricePaid: true },
      _count: true,
      orderBy: { _sum: { pricePaid: "desc" } },
      take: 10,
    }),
    prisma.eventPurchase.groupBy({
      by: ["eventMinerId"],
      _sum: { pricePaid: true },
      _count: true,
      orderBy: { _sum: { pricePaid: "desc" } },
      take: 10,
    }),
  ]);

  const [shopTotalAgg, offersTotalAgg] = await Promise.all([
    prisma.userOwnedMachine.aggregate({ where: { acquisitionSource: "shop", snapshotPrice: { gt: 0 } }, _sum: { snapshotPrice: true } }),
    prisma.eventPurchase.aggregate({ _sum: { pricePaid: true } }),
  ]);

  const allUserIds = [...shopByUser.map((r) => r.userId), ...offersByUser.map((r) => r.userId), ...depositsByUser.map((r) => r.userId)];
  const usernames = await usernamesFor(allUserIds);

  const [events, eventMiners] = await Promise.all([
    prisma.offerEvent.findMany({ where: { id: { in: offerRevenueByEvent.map((r) => r.eventId) } }, select: { id: true, title: true } }),
    prisma.eventMiner.findMany({
      where: { id: { in: offerRevenueByItem.map((r) => r.eventMinerId) } },
      select: { id: true, name: true, event: { select: { title: true } } },
    }),
  ]);
  const eventTitleById = new Map(events.map((e) => [e.id, e.title]));
  const eventMinerById = new Map(eventMiners.map((m) => [m.id, m]));

  return {
    topShopSpendersPol: shopByUser.map((r) => ({
      username: usernames.get(r.userId) ?? `user#${r.userId}`,
      totalPol: Number(r._sum.snapshotPrice ?? 0),
      unitsBought: r._count,
    })),
    topOfferSpendersPol: offersByUser.map((r) => ({
      username: usernames.get(r.userId) ?? `user#${r.userId}`,
      totalPol: Number(r._sum.pricePaid ?? 0),
      purchases: r._count,
    })),
    topDepositorsUsd: depositsByUser
      .filter((r) => Number(r._sum.usdValueAtConfirmation ?? 0) > 0)
      .map((r) => ({
        username: usernames.get(r.userId) ?? `user#${r.userId}`,
        totalUsd: Number(r._sum.usdValueAtConfirmation ?? 0),
        deposits: r._count,
      })),
    totalPolSpentShopAllTime: Number(shopTotalAgg._sum.snapshotPrice ?? 0),
    totalPolSpentOffersAllTime: Number(offersTotalAgg._sum.pricePaid ?? 0),
    offerEventRevenue: offerRevenueByEvent.map((r) => ({
      eventTitle: eventTitleById.get(r.eventId) ?? `event#${r.eventId}`,
      totalPol: Number(r._sum.pricePaid ?? 0),
      purchases: r._count,
    })),
    topOfferItems: offerRevenueByItem.map((r) => ({
      itemName: eventMinerById.get(r.eventMinerId)?.name ?? `item#${r.eventMinerId}`,
      eventTitle: eventMinerById.get(r.eventMinerId)?.event?.title ?? "—",
      totalPol: Number(r._sum.pricePaid ?? 0),
      purchases: r._count,
    })),
  };
}
