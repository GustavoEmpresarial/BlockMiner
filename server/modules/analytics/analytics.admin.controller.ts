import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import prisma from '../../core/database/prisma.js';
import { logger } from '../../core/logger/index.js';
import { getOrCompute, ALLTIME_TTL_MS } from './analytics.cache.js';
import {
  parsePeriodParam,
  queryPositiveInt,
  siteLaunchDate,
  buildBuckets,
  resolveAnalyticsPeriod,
  bucketKeyFor,
  getMiningEconomySnapshot,
} from './analytics.helpers.js';
import type {
  PeriodKey,
  AnalyticsPayload,
  InflationResponse,
  ProjectionsResponse,
  WithdrawalsResponse,
  DistributionResponse,
  ExecutiveSummary,
  ExecutiveResponse,
  AdminStatsResponse,
  MiningExpectedMetrics,
  TopEarnerRow,
  UserRecentBlockRow,
} from './analytics.types.js';

export {
  parsePeriodParam,
  queryPositiveInt,
  siteLaunchDate,
  buildBuckets,
  resolveAnalyticsPeriod,
  bucketKeyFor,
};

const log = logger.child('AdminAnalyticsController');

/** GET /api/admin/stats — dashboard headline numbers. */
export async function getStats(
  _req: Request,
  res: Response<AdminStatsResponse | { ok: false; message: string }>
): Promise<void> {
  try {
    const now = Date.now();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersBanned,
      usersNew24h,
      usersActive7d,
      minersTotal,
      minersActive,
      minersActiveEngaged,
      balancesAll,
      balancesActive,
      tx24h,
      economy,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { isBanned: false, lastLoginAt: { gte: weekAgo } } }),
      prisma.miner.count(),
      prisma.userMiner.count({
        where: { isActive: true, hashRate: { gt: 0 }, user: { isBanned: false } },
      }),
      prisma.userMiner.count({
        where: {
          isActive: true,
          hashRate: { gt: 0 },
          user: { isBanned: false, lastLoginAt: { gte: weekAgo } },
        },
      }),
      prisma.user.aggregate({ _sum: { polBalance: true } }),
      prisma.user.aggregate({ _sum: { polBalance: true }, where: { isBanned: false } }),
      prisma.transaction.count({ where: { createdAt: { gte: dayAgo } } }),
      getMiningEconomySnapshot(),
    ]);

    const balanceTotal = Number(balancesActive._sum.polBalance || 0);
    const balanceIncludingBanned = Number(balancesAll._sum.polBalance || 0);
    const balanceBanned = balanceIncludingBanned - balanceTotal;

    res.json({
      ok: true,
      stats: {
        usersTotal,
        usersBanned,
        usersNew24h,
        usersActive7d,
        minersTotal,
        minersActive,
        minersActiveEngaged,
        balanceTotal,
        balanceTotalUsd: economy.polPrice > 0 ? balanceTotal * economy.polPrice : null,
        balanceIncludingBanned,
        balanceBanned,
        polUsdPrice: economy.polPrice,
        transactions24h: tx24h,
        miningBlockRewardPol: economy.rewardBase,
        miningBlockIntervalMinutes: economy.blockDurationMinutes,
      },
    });
  } catch (error) {
    log.error('Admin stats error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Unable to load admin stats.' });
  }
}

/** GET /api/admin/analytics/executive?period=week — platform KPIs for the overview panel. */
export async function getExecutive(
  req: Request,
  res: Response<ExecutiveResponse | { ok: false; message: string }>
): Promise<void> {
  try {
    const period = parsePeriodParam(req.query.period);
    const now = new Date();
    const { since } = buildBuckets(period, now);
    const payload = await getOrCompute(`analytics:executive:${period}`, async () => {
      const periodDistributed = await prisma.blockMinerReward.aggregate({
        _sum: { rewardAmount: true },
        where: { createdAt: { gte: since } },
      });
      return computeExecutiveSummary(since, Number(periodDistributed._sum.rewardAmount || 0));
    });
    res.json({ ok: true, executive: payload });
  } catch (error) {
    log.error('Admin analytics executive error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Erro ao carregar resumo executivo.' });
  }
}

/** GET /api/admin/analytics?period=day|week|month|year|all&userId=optional */
export async function getAnalytics(
  req: Request,
  res: Response<AnalyticsPayload | { ok: false; message: string }>
): Promise<void> {
  try {
    const period = parsePeriodParam(req.query.period);
    const userIdNum = queryPositiveInt(req.query.userId);
    const payload = await getOrCompute(`analytics:${period}:${userIdNum ?? 'all'}`, () =>
      computeAnalytics(period, userIdNum)
    );
    res.json(payload);
  } catch (error) {
    log.error('Admin analytics error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Erro ao carregar analytics.' });
  }
}

interface AllTimeRewardTotals {
  totalDistributed: { _sum: { reward?: number | null; rewardAmount?: number | null } };
  totalWithdrawals: { _sum: { amount: number | null } };
  topEarners: Array<{ userId: number; _sum: { rewardAmount: number } }> | null;
}

async function computeAllTimeRewardTotals(
  userIdNum: number | undefined,
  userFilter: Record<string, unknown>
): Promise<AllTimeRewardTotals> {
  const [totalDistributed, totalWithdrawals, topEarners] = await Promise.all([
    userIdNum !== undefined
      ? prisma.blockMinerReward.aggregate({
          _sum: { rewardAmount: true },
          where: userFilter,
        })
      : prisma.blockDistribution.aggregate({ _sum: { reward: true } }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { ...userFilter, type: 'withdrawal', status: 'completed' },
    }),
    userIdNum !== undefined
      ? Promise.resolve(null)
      : prisma
          .$queryRaw<Array<{ userId: number; total: number | null }>>(
            Prisma.sql`
              SELECT user_id AS "userId", SUM(reward_amount)::float8 AS total
              FROM block_miner_rewards
              GROUP BY user_id
              ORDER BY 2 DESC
              LIMIT 10
            `
          )
          .then((rows) =>
            rows.map((r) => ({
              userId: r.userId,
              _sum: { rewardAmount: Number(r.total || 0) },
            }))
          ),
  ]);
  return {
    totalDistributed: totalDistributed as { _sum: { reward?: number | null; rewardAmount?: number | null } },
    totalWithdrawals: totalWithdrawals as { _sum: { amount: number | null } },
    topEarners,
  };
}

function totalDistributedPolFromAgg(
  userIdNum: number | undefined,
  agg: { _sum: { reward?: number | null; rewardAmount?: number | null } }
): number {
  if (userIdNum !== undefined) {
    return Number(agg._sum.rewardAmount || 0);
  }
  return Number(agg._sum.reward ?? agg._sum.rewardAmount ?? 0);
}

async function computeExecutiveSummary(
  since: Date,
  periodDistributedPol: number
): Promise<ExecutiveSummary> {
  const now = Date.now();
  const periodDays = Math.max(1 / 24, (now - since.getTime()) / 86_400_000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const allTime = await getOrCompute('analytics:executive:alltime', async () => {
    const [
      usersTotal,
      activeMiners,
      balances,
      totalDeposits,
      pendingWd,
      withdrawalAgg,
      miningExpected,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.userMiner.count({ where: { isActive: true, hashRate: { gt: 0 } } }),
      prisma.user.aggregate({ _sum: { polBalance: true }, where: { isBanned: false } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'deposit', status: 'completed' },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { type: 'withdrawal', status: { in: ['pending', 'approved'] } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { type: 'withdrawal', status: 'completed' },
      }),
      getOrCompute('distribution:mining-expected', computeMiningExpected, ALLTIME_TTL_MS),
    ]);

    const balancesPol = Number(balances._sum.polBalance || 0);
    const depositsTotal = Number(totalDeposits._sum.amount || 0);
    const withdrawnTotal = Number(withdrawalAgg._sum.amount || 0);
    const withdrawalCount = withdrawalAgg._count._all;
    const pendingPol = Number(pendingWd._sum.amount || 0);
    const pendingCount = pendingWd._count._all;

    return {
      usersTotal,
      activeMiners,
      balancesPol,
      depositsTotal,
      withdrawnTotal,
      withdrawalCount,
      pendingPol,
      pendingCount,
      retentionPercent:
        depositsTotal > 0
          ? Number((((balancesPol + pendingPol) / depositsTotal) * 100).toFixed(2))
          : 0,
      withdrawalDepositRatioPercent:
        depositsTotal > 0 ? Number(((withdrawnTotal / depositsTotal) * 100).toFixed(2)) : 0,
      internalSpendPol: Number(
        Math.max(0, depositsTotal - balancesPol - withdrawnTotal - pendingPol).toFixed(4)
      ),
      avgWithdrawal:
        withdrawalCount > 0 ? Number((withdrawnTotal / withdrawalCount).toFixed(4)) : 0,
      miningEfficiencyPercent: miningExpected.efficiencyPercent,
      siteAgeDays: miningExpected.siteAgeDays,
      totalBlocks: miningExpected.actualBlocks,
      theoreticalDailyEmission: Number(
        (miningExpected.blocksPerDay * miningExpected.rewardBase).toFixed(4)
      ),
    };
  }, ALLTIME_TTL_MS);

  const [newUsersInPeriod, periodDeposits, newUsers24h, deposits24h, withdrawals24h] =
    await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'deposit', status: 'completed', createdAt: { gte: since } },
      }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'deposit', status: 'completed', createdAt: { gte: dayAgo } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: 'withdrawal', status: 'completed', createdAt: { gte: dayAgo } },
      }),
    ]);

  return {
    ...allTime,
    newUsersInPeriod,
    newUsers24h,
    periodDeposits: Number(periodDeposits._sum.amount || 0),
    deposits24h: Number(deposits24h._sum.amount || 0),
    withdrawals24h: Number(withdrawals24h._sum.amount || 0),
    empiricalDailyEmission: Number((periodDistributedPol / periodDays).toFixed(4)),
    periodDays: Number(periodDays.toFixed(2)),
  };
}

async function computeAnalytics(
  period: PeriodKey,
  userIdNum: number | undefined
): Promise<AnalyticsPayload> {
  const economy = await getMiningEconomySnapshot();
  const now = new Date();
  const { since, buckets: months } = buildBuckets(period, now);
  const userFilter = userIdNum !== undefined ? { userId: userIdNum } : {};
  const unit = period === 'day' ? 'hour' : period === 'year' || period === 'all' ? 'month' : 'day';
  const userClause = userIdNum !== undefined ? Prisma.sql`AND user_id = ${userIdNum}` : Prisma.empty;

  const [
    { totalDistributed, totalWithdrawals, topEarners },
    periodDistributed,
    rewardsOverTime,
    periodWithdrawals,
    activeUsersCount,
    blockCount,
    totalBlocksEver,
    networkHashData,
  ] = await Promise.all([
    getOrCompute(
      `analytics:alltime:${userIdNum ?? 'all'}`,
      () => computeAllTimeRewardTotals(userIdNum, userFilter),
      ALLTIME_TTL_MS
    ),
    prisma.blockMinerReward.aggregate({
      _sum: { rewardAmount: true },
      where: { ...userFilter, createdAt: { gte: since } },
    }),
    prisma.$queryRaw<Array<{ bucket: Date | string; total: number | null }>>(
      Prisma.sql`
        SELECT date_trunc(${unit}, created_at) AS bucket,
               COALESCE(SUM(reward_amount), 0)::float8 AS total
        FROM block_miner_rewards
        WHERE created_at >= ${since} ${userClause}
        GROUP BY 1
      `
    ),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        ...userFilter,
        type: 'withdrawal',
        status: 'completed',
        createdAt: { gte: since },
      },
    }),
    userIdNum !== undefined
      ? Promise.resolve(null)
      : prisma
          .$queryRaw<Array<{ cnt: number }>>(
            Prisma.sql`
              SELECT COUNT(DISTINCT user_id)::int AS cnt
              FROM block_miner_rewards
              WHERE created_at >= ${since}
            `
          )
          .then((r) => r[0]?.cnt ?? 0),
    userIdNum !== undefined
      ? Promise.resolve(null)
      : prisma.blockDistribution.count({ where: { createdAt: { gte: since } } }),
    prisma.blockDistribution.count(),
    prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true } }),
  ]);

  let userHashRate = 0;
  if (userIdNum !== undefined) {
    const uhr = await prisma.userMiner.aggregate({
      _sum: { hashRate: true },
      where: { userId: userIdNum, isActive: true },
    });
    userHashRate = Number(uhr._sum.hashRate || 0);
  }

  const networkHashRate = Number(networkHashData._sum.hashRate || 1);
  const shareRatio =
    userIdNum !== undefined && networkHashRate > 0 ? userHashRate / networkHashRate : 1;
  const forecastDay = economy.blocksPerDay * economy.rewardBase * shareRatio;
  const forecastWeek = economy.blocksPerDay * 7 * economy.rewardBase * shareRatio;
  const forecastMonth = economy.blocksPerMonth * economy.rewardBase * shareRatio;
  const forecastYear = economy.blocksPerYear * economy.rewardBase * shareRatio;

  let topEarnersWithInfo: TopEarnerRow[] = [];
  if (topEarners && topEarners.length > 0) {
    const userIds = topEarners.map((e) => e.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, email: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));
    topEarnersWithInfo = topEarners.map((e) => ({
      userId: e.userId,
      username: uMap.get(e.userId)?.username || uMap.get(e.userId)?.email || `#${e.userId}`,
      total: Number(e._sum.rewardAmount || 0),
      totalUsd: Number(e._sum.rewardAmount || 0) * economy.polPrice,
    }));
  }

  const buckets: Record<string, number> = {};
  for (const r of rewardsOverTime) {
    const d = new Date(r.bucket);
    const key = bucketKeyFor(d, unit as 'hour' | 'day' | 'month');
    buckets[key] = (buckets[key] || 0) + Number(r.total || 0);
  }

  const chartData = months.map((m) => {
    const dateObj = new Date(m.year, m.month - 1, m.day ?? 1);
    const key = bucketKeyFor(dateObj, unit as 'hour' | 'day' | 'month', m.hour);
    const pol = Number((buckets[key] || 0).toFixed(8));
    return { label: m.label, value: pol, valueUsd: pol * economy.polPrice };
  });

  let userRecentBlocks: UserRecentBlockRow[] | null = null;
  if (userIdNum !== undefined) {
    const rawBlocks = await prisma.blockMinerReward.findMany({
      where: { userId: userIdNum },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { block: { select: { blockNumber: true, reward: true } } },
    });
    userRecentBlocks = rawBlocks.map((b) => ({
      id: b.id,
      blockId: b.blockId,
      block: b.block
        ? {
            blockNumber: b.block.blockNumber,
            reward: Number(b.block.reward ?? 0),
          }
        : null,
      rewardAmount: Number(b.rewardAmount),
      percentage: Number(b.percentage ?? 0),
      createdAt: b.createdAt,
    }));
  }

  const totalDistributedPol = totalDistributedPolFromAgg(userIdNum, totalDistributed);
  const periodDistributedPol = Number(periodDistributed._sum.rewardAmount || 0);
  const totalWithdrawalsPol = Number(totalWithdrawals._sum.amount || 0);
  const periodWithdrawalsPol = Number(periodWithdrawals._sum.amount || 0);

  return {
    ok: true,
    polPrice: economy.polPrice,
    summary: {
      totalDistributed: totalDistributedPol,
      totalDistributedUsd: totalDistributedPol * economy.polPrice,
      periodDistributed: periodDistributedPol,
      periodDistributedUsd: periodDistributedPol * economy.polPrice,
      totalWithdrawals: totalWithdrawalsPol,
      totalWithdrawalsUsd: totalWithdrawalsPol * economy.polPrice,
      periodWithdrawals: periodWithdrawalsPol,
      periodWithdrawalsUsd: periodWithdrawalsPol * economy.polPrice,
      activeUsers: activeUsersCount ?? null,
      blockCount: blockCount ?? null,
      totalBlocksEver,
      networkHashRate,
      userHashRate: userIdNum !== undefined ? userHashRate : null,
      period,
    },
    forecast: {
      day: { pol: forecastDay, usd: forecastDay * economy.polPrice },
      week: { pol: forecastWeek, usd: forecastWeek * economy.polPrice },
      month: { pol: forecastMonth, usd: forecastMonth * economy.polPrice },
      year: { pol: forecastYear, usd: forecastYear * economy.polPrice },
      sharePercent: userIdNum !== undefined ? shareRatio * 100 : null,
      networkHashRate,
      userHashRate: userIdNum !== undefined ? userHashRate : null,
    },
    topEarners: topEarnersWithInfo,
    chartData,
    userRecentBlocks,
  };
}

/** GET /api/admin/analytics/inflation?period=week|month|year */
export async function getInflation(
  req: Request,
  res: Response<InflationResponse | { ok: false; message: string }>
): Promise<void> {
  try {
    const period = parsePeriodParam(req.query.period);
    const payload = await getOrCompute(`analytics:inflation:${period}`, () =>
      computeInflation(period)
    );
    res.json(payload);
  } catch (error) {
    log.error('Admin analytics inflation error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Erro ao carregar inflação.' });
  }
}

async function computeInflation(period: PeriodKey): Promise<InflationResponse> {
  const { period: p, since, buckets, bucketUnit } = resolveAnalyticsPeriod(period);
  const economy = await getMiningEconomySnapshot();

  const [distributedBuckets, withdrawalBuckets, totalDistributedAgg, totalWithdrawnAgg] =
    await Promise.all([
      prisma.$queryRaw<Array<{ bucket: Date | string; total: number | null }>>(
        Prisma.sql`
          SELECT date_trunc(${bucketUnit}, created_at) AS bucket, COALESCE(SUM(reward_amount), 0)::float8 AS total
          FROM block_miner_rewards WHERE created_at >= ${since} GROUP BY 1
        `
      ),
      prisma.$queryRaw<Array<{ bucket: Date | string; total: number | null }>>(
        Prisma.sql`
          SELECT date_trunc(${bucketUnit}, created_at) AS bucket, COALESCE(SUM(amount), 0)::float8 AS total
          FROM transactions WHERE type = 'withdrawal' AND status = 'completed' AND created_at >= ${since} GROUP BY 1
        `
      ),
      getOrCompute(
        'analytics:mining-distributed-alltime',
        () => prisma.blockDistribution.aggregate({ _sum: { reward: true } }),
        ALLTIME_TTL_MS
      ),
      getOrCompute(
        'analytics:withdrawn-alltime',
        () =>
          prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: 'withdrawal', status: 'completed' },
          }),
        ALLTIME_TTL_MS
      ),
    ]);

  const distMap: Record<string, number> = {};
  for (const r of distributedBuckets) {
    distMap[bucketKeyFor(new Date(r.bucket), bucketUnit)] = Number(r.total || 0);
  }

  const wMap: Record<string, number> = {};
  for (const r of withdrawalBuckets) {
    wMap[bucketKeyFor(new Date(r.bucket), bucketUnit)] = Number(r.total || 0);
  }

  const totalDistributedAll = Number(totalDistributedAgg._sum.reward || 0);
  const totalWithdrawnAll = Number(totalWithdrawnAgg._sum.amount || 0);
  const periodDistributedTotal = Object.values(distMap).reduce((s, n) => s + n, 0);
  const periodWithdrawnTotal = Object.values(wMap).reduce((s, n) => s + n, 0);
  let cumulative = totalDistributedAll - periodDistributedTotal + periodWithdrawnTotal;

  const series = buckets.map((b) => {
    const k = bucketKeyFor(b.from, bucketUnit);
    const distributed = Number((distMap[k] || 0).toFixed(8));
    const withdrawn = Number((wMap[k] || 0).toFixed(8));
    const net = distributed - withdrawn;
    cumulative += net;
    return {
      label: b.label,
      distributed,
      withdrawn,
      net: Number(net.toFixed(8)),
      cumulative: Number(cumulative.toFixed(8)),
    };
  });

  const avgDailyDistributed =
    bucketUnit === 'day' && series.length > 0 ? periodDistributedTotal / series.length : 0;
  const avgDailyWithdrawn =
    bucketUnit === 'day' && series.length > 0 ? periodWithdrawnTotal / series.length : 0;
  const netInflationRate =
    totalDistributedAll > 0
      ? ((totalDistributedAll - totalWithdrawnAll) / totalDistributedAll) * 100
      : 0;

  return {
    ok: true,
    period: p,
    polPrice: economy.polPrice,
    series,
    totals: {
      allTimeDistributed: totalDistributedAll,
      allTimeWithdrawn: totalWithdrawnAll,
      periodDistributed: periodDistributedTotal,
      periodWithdrawn: periodWithdrawnTotal,
      circulatingNet: totalDistributedAll - totalWithdrawnAll,
      netInflationRatePercent: netInflationRate,
      avgDailyDistributed,
      avgDailyWithdrawn,
    },
  };
}

/** GET /api/admin/analytics/projections?period=day|week|month|year|all&userId=optional */
export async function getProjections(
  req: Request,
  res: Response<ProjectionsResponse | { ok: false; message: string }>
): Promise<void> {
  try {
    const period = parsePeriodParam(req.query.period);
    const userIdNum = queryPositiveInt(req.query.userId);
    const payload = await getOrCompute(`analytics:projections:${period}:${userIdNum ?? 'all'}`, () =>
      computeProjections(period, userIdNum)
    );
    res.json(payload);
  } catch (error) {
    log.error('Admin analytics projections error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Erro ao carregar projeções.' });
  }
}

async function computeProjections(
  period: PeriodKey,
  userIdNum: number | undefined
): Promise<ProjectionsResponse> {
  const economy = await getMiningEconomySnapshot();
  const now = new Date();
  const windowSince =
    period === 'day'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : period === 'week'
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : period === 'year'
      ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      : period === 'all'
      ? siteLaunchDate()
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const windowDays = Math.max(1 / 24, (now.getTime() - windowSince.getTime()) / 86_400_000);
  const windowAggPromise =
    userIdNum !== undefined
      ? prisma.blockMinerReward.aggregate({
          _sum: { rewardAmount: true },
          _count: { _all: true },
          where: { createdAt: { gte: windowSince }, userId: userIdNum },
        })
      : prisma.blockDistribution.aggregate({
          _sum: { reward: true },
          _count: { _all: true },
          where: { createdAt: { gte: windowSince } },
        });

  const [netAgg, userAgg, windowAgg] = await Promise.all([
    prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true } }),
    userIdNum !== undefined
      ? prisma.userMiner.aggregate({
          _sum: { hashRate: true },
          where: { isActive: true, userId: userIdNum },
        })
      : Promise.resolve(null),
    windowAggPromise,
  ]);

  const networkHashRate = Number(netAgg._sum.hashRate || 0);
  const userHashRate = userAgg ? Number(userAgg._sum.hashRate || 0) : 0;
  const share =
    userIdNum !== undefined && networkHashRate > 0 ? userHashRate / networkHashRate : 1;
  const theo = (days: number) => economy.blocksPerDay * economy.rewardBase * share * days;
  const sumObj = windowAgg._sum as { rewardAmount?: number | null; reward?: number | null };
  const windowTotal =
    userIdNum !== undefined
      ? Number(sumObj.rewardAmount || 0)
      : Number(sumObj.reward || 0);
  const empiricalDaily = windowAgg._count._all > 0 ? windowTotal / windowDays : 0;
  const empirical = (days: number) => empiricalDaily * days;

  return {
    ok: true,
    period,
    polPrice: economy.polPrice,
    networkHashRate,
    userHashRate: userIdNum !== undefined ? userHashRate : null,
    sharePercent: userIdNum !== undefined ? share * 100 : null,
    theoretical: {
      day1: theo(1),
      day7: theo(7),
      day30: theo(30),
      day90: theo(90),
      day365: theo(365),
    },
    empirical: {
      windowDays: Number(windowDays.toFixed(2)),
      avgDaily: empiricalDaily,
      avgDailyLast30: empiricalDaily,
      day7: empirical(7),
      day30: empirical(30),
      day90: empirical(90),
    },
    assumptions: {
      blockRewardPol: economy.rewardBase,
      blocksPerDay: economy.blocksPerDay,
    },
  };
}

/** GET /api/admin/analytics/withdrawals?period=&userId= */
export async function getWithdrawalStats(
  req: Request,
  res: Response<WithdrawalsResponse | { ok: false; message: string }>
): Promise<void> {
  try {
    const period = parsePeriodParam(req.query.period);
    const userIdNum = queryPositiveInt(req.query.userId);
    const payload = await getOrCompute(
      `analytics:withdrawals:${period}:${userIdNum ?? 'all'}`,
      () => computeWithdrawalStats(period, userIdNum)
    );
    res.json(payload);
  } catch (error) {
    log.error('Admin analytics withdrawals error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Erro ao carregar saques.' });
  }
}

async function computeWithdrawalStats(
  period: PeriodKey,
  userIdNum: number | undefined
): Promise<WithdrawalsResponse> {
  const { period: p, since, buckets, bucketUnit } = resolveAnalyticsPeriod(period);
  const economy = await getMiningEconomySnapshot();
  const userClause = userIdNum !== undefined ? Prisma.sql`AND user_id = ${userIdNum}` : Prisma.empty;

  const [statsRow, statusRows, seriesRows] = await Promise.all([
    getOrCompute(
      `analytics:withdrawal-stats-alltime:${userIdNum ?? 'all'}`,
      () =>
        prisma.$queryRaw<
          Array<{
            cnt: bigint | number;
            total: number | null;
            avg: number | null;
            median: number | null;
            p90: number | null;
            p99: number | null;
            avg_ttc_ms: number | null;
            median_ttc_ms: number | null;
          }>
        >(Prisma.sql`
          SELECT
              COUNT(*) AS cnt,
              COALESCE(SUM(amount), 0)::float8 AS total,
              COALESCE(AVG(amount), 0)::float8 AS avg,
              COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY amount), 0)::float8 AS median,
              COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY amount), 0)::float8 AS p90,
              COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY amount), 0)::float8 AS p99,
              COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= created_at), 0)::float8 AS avg_ttc_ms,
              COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= created_at), 0)::float8 AS median_ttc_ms
          FROM transactions
          WHERE type = 'withdrawal' AND status = 'completed' ${userClause}
        `),
      ALLTIME_TTL_MS
    ),
    prisma.$queryRaw<Array<{ status: string; cnt: bigint | number }>>(Prisma.sql`
      SELECT LOWER(status) AS status, COUNT(*) AS cnt
      FROM transactions
      WHERE type = 'withdrawal' AND created_at >= ${since} ${userClause}
      GROUP BY 1
    `),
    prisma.$queryRaw<Array<{ bucket: Date | string; cnt: bigint | number; amount: number | null }>>(
      Prisma.sql`
        SELECT date_trunc(${bucketUnit}, created_at) AS bucket,
               COUNT(*) AS cnt,
               COALESCE(SUM(amount), 0)::float8 AS amount
        FROM transactions
        WHERE type = 'withdrawal' AND status = 'completed' AND created_at >= ${since} ${userClause}
        GROUP BY 1
      `
    ),
  ]);

  const s = statsRow[0] ?? {
    cnt: 0,
    total: 0,
    avg: 0,
    median: 0,
    p90: 0,
    p99: 0,
    avg_ttc_ms: 0,
    median_ttc_ms: 0,
  };

  const statusCount = { completed: 0, pending: 0, failed: 0, other: 0 };
  for (const r of statusRows) {
    const n = Number(r.cnt);
    if (r.status === 'completed') statusCount.completed += n;
    else if (r.status === 'pending') statusCount.pending += n;
    else if (r.status === 'failed') statusCount.failed += n;
    else statusCount.other += n;
  }

  const bucketMap: Record<string, { count: number; amount: number }> = {};
  for (const r of seriesRows) {
    bucketMap[bucketKeyFor(new Date(r.bucket), bucketUnit)] = {
      count: Number(r.cnt),
      amount: Number(r.amount || 0),
    };
  }

  const series = buckets.map((b) => {
    const k = bucketKeyFor(b.from, bucketUnit);
    const cur = bucketMap[k] || { count: 0, amount: 0 };
    return { label: b.label, count: cur.count, amount: Number(cur.amount.toFixed(8)) };
  });

  return {
    ok: true,
    period: p,
    polPrice: economy.polPrice,
    stats: {
      completedCount: Number(s.cnt),
      totalAmount: Number(s.total || 0),
      avg: Number(s.avg || 0),
      median: Number(s.median || 0),
      p90: Number(s.p90 || 0),
      p99: Number(s.p99 || 0),
      avgTimeToCompleteMs: Number(s.avg_ttc_ms || 0),
      medianTimeToCompleteMs: Number(s.median_ttc_ms || 0),
    },
    statusBreakdownPeriod: statusCount,
    series,
  };
}

/** GET /api/admin/analytics/distribution?period=&userId= */
export async function getDistribution(
  req: Request,
  res: Response<DistributionResponse | { ok: false; message: string }>
): Promise<void> {
  try {
    const { period, since } = resolveAnalyticsPeriod(req.query.period);
    const userIdNum = queryPositiveInt(req.query.userId);
    const payload = await getOrCompute(`distribution:${period}:${userIdNum ?? 'all'}`, () =>
      computeDistribution(period, since, userIdNum)
    );
    res.json(payload);
  } catch (error) {
    log.error('Admin analytics distribution error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: 'Erro ao carregar distribuição.' });
  }
}

async function computeMiningExpected(): Promise<MiningExpectedMetrics> {
  const launchDate = siteLaunchDate();
  const now = new Date();
  const ageMs = Math.max(0, now.getTime() - launchDate.getTime());
  const ageDays = ageMs / 86400000;
  const economy = await getMiningEconomySnapshot();

  const expectedBlocks = ageDays * economy.blocksPerDay;
  const expectedPol = expectedBlocks * economy.rewardBase;

  const [actualMiningAllTime, actualBlocksAllTime] = await Promise.all([
    prisma.blockDistribution.aggregate({ _sum: { reward: true } }),
    prisma.blockDistribution.count(),
  ]);

  const actualPol = Number(actualMiningAllTime._sum.reward || 0);
  const efficiency = expectedPol > 0 ? (actualPol / expectedPol) * 100 : 0;

  return {
    launchDate: launchDate.toISOString(),
    siteAgeDays: Math.floor(ageDays * 10) / 10,
    rewardBase: economy.rewardBase,
    blockDurationMinutes: economy.blockDurationMinutes,
    blocksPerDay: Math.round(economy.blocksPerDay),
    expectedBlocks: Math.round(expectedBlocks),
    expectedPol: Number(expectedPol.toFixed(4)),
    actualBlocks: actualBlocksAllTime,
    actualPol: Number(actualPol.toFixed(4)),
    efficiencyPercent: Number(efficiency.toFixed(2)),
    missingBlocks: Math.max(0, Math.round(expectedBlocks) - actualBlocksAllTime),
    missingPol: Number(Math.max(0, expectedPol - actualPol).toFixed(4)),
  };
}

async function computeDistribution(
  period: PeriodKey,
  since: Date,
  userIdNum: number | undefined
): Promise<DistributionResponse> {
  const economy = await getMiningEconomySnapshot();
  const userFilter = userIdNum !== undefined ? { userId: userIdNum } : {};
  const referrerFilter = userIdNum !== undefined ? { referrerId: userIdNum } : {};

  const [
    miningAgg,
    referralAgg,
    zeradsAgg,
    offerwallMeAgg,
    inboxAgg,
    adminCreditAgg,
    withdrawalsAgg,
    depositsAgg,
  ] = await Promise.all([
    userIdNum !== undefined
      ? prisma.blockMinerReward
          .aggregate({
            _sum: { rewardAmount: true },
            _count: { _all: true },
            where: { userId: userIdNum, createdAt: { gte: since } },
          })
          .then((a) => ({ pol: Number(a._sum.rewardAmount || 0), count: a._count._all }))
      : prisma.blockDistribution
          .aggregate({
            _sum: { reward: true },
            _count: { _all: true },
            where: { createdAt: { gte: since } },
          })
          .then((a) => ({ pol: Number(a._sum.reward || 0), count: a._count._all })),
    prisma.referralEarning.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...referrerFilter, createdAt: { gte: since } },
    }),
    prisma.zeradsCallback.aggregate({
      _sum: { payoutAmount: true },
      _count: { _all: true },
      where: { ...userFilter, createdAt: { gte: since } },
    }),
    prisma.offerwallMeCallback.aggregate({
      _sum: { polCredited: true },
      _count: { _all: true },
      where: { ...userFilter, createdAt: { gte: since } },
    }),
    prisma.userRewardInbox.aggregate({
      _sum: { rewardValue: true },
      _count: { _all: true },
      where: {
        ...userFilter,
        status: 'collected',
        rewardType: 'pol',
        collectedAt: { gte: since },
      },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...userFilter,
        type: 'admin_credit',
        status: 'completed',
        createdAt: { gte: since },
      },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...userFilter,
        type: 'withdrawal',
        status: 'completed',
        createdAt: { gte: since },
      },
    }),
    prisma.transaction.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        ...userFilter,
        type: 'deposit',
        status: 'completed',
        txHash: { not: null },
        createdAt: { gte: since },
      },
    }),
  ]);

  const sources = [
    { key: 'mining', label: 'Mineração (blocos)', pol: miningAgg.pol, count: miningAgg.count },
    {
      key: 'referral',
      label: 'Indicações',
      pol: Number(referralAgg._sum.amount || 0),
      count: referralAgg._count._all,
    },
    {
      key: 'zerads',
      label: 'PTC (ZerAds)',
      pol: Number(zeradsAgg._sum.payoutAmount || 0),
      count: zeradsAgg._count._all,
    },
    {
      key: 'offerwallme',
      label: 'Offerwall (OfferwallMe)',
      pol: Number(offerwallMeAgg._sum.polCredited || 0),
      count: offerwallMeAgg._count._all,
    },
    {
      key: 'inbox',
      label: 'Inbox de recompensas (faucet/checkin/tasks)',
      pol: Number(inboxAgg._sum.rewardValue || 0),
      count: inboxAgg._count._all,
    },
    {
      key: 'admin_credit',
      label: 'Crédito manual (admin)',
      pol: Number(adminCreditAgg._sum.amount || 0),
      count: adminCreditAgg._count._all,
    },
  ];

  const inflowTotal = sources.reduce((s, x) => s + x.pol, 0);
  const outflows = [
    {
      key: 'withdrawals',
      label: 'Saques',
      pol: Number(withdrawalsAgg._sum.amount || 0),
      count: withdrawalsAgg._count._all,
    },
  ];
  const depositsInflow = {
    key: 'deposits',
    label: 'Depósitos (entrada externa)',
    pol: Number(depositsAgg._sum.amount || 0),
    count: depositsAgg._count._all,
  };

  const miningExpected = await getOrCompute(
    'distribution:mining-expected',
    computeMiningExpected,
    ALLTIME_TTL_MS
  );

  return {
    ok: true,
    period,
    polPrice: economy.polPrice,
    sources: sources.map((s) => ({
      ...s,
      sharePercent: inflowTotal > 0 ? (s.pol / inflowTotal) * 100 : 0,
    })),
    totalInflowFromSources: inflowTotal,
    depositsInflow,
    outflows,
    miningExpected,
  };
}
