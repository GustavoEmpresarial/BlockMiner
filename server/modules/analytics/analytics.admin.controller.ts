// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { getPolUsdPrice } from "../wallet/index.js";
import { miningEngine } from "../mining/index.js";
import { getOrCompute, ALLTIME_TTL_MS } from "./analytics.cache.js";
const log = logger.child("AdminAnalyticsController");
/** Engine constants — confirmed against legacy/server/modules/analytics/analytics.admin.routes.ts
 *  (fallback values only; the real engine's live rewardBase/blockDurationMs are preferred below). */
const BLOCK_REWARD_POL_FALLBACK = 0.3;
const BLOCK_DURATION_MS_FALLBACK = 10 * 60 * 1000; // 10 min
function queryPositiveInt(v) {
    if (v === undefined || v === null || v === "")
        return undefined;
    const raw = Array.isArray(v) ? v[0] : v;
    const s = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
    if (!/^\d{1,12}$/.test(s))
        return undefined;
    const n = Number(s);
    if (!Number.isSafeInteger(n) || n < 1)
        return undefined;
    return n;
}
/** GET /api/admin/stats — dashboard headline numbers. */
export async function getStats(_req, res) {
    try {
        const now = Date.now();
        const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const [usersTotal, usersBanned, usersNew24h, usersActive7d, minersTotal, minersActive, minersActiveEngaged, balancesAll, balancesActive, tx24h,] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isBanned: true } }),
            prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
            prisma.user.count({ where: { isBanned: false, lastLoginAt: { gte: weekAgo } } }),
            prisma.miner.count(),
            prisma.userMiner.count({
                where: { isActive: true, hashRate: { gt: 0 }, user: { isBanned: false } },
            }),
            prisma.userMiner.count({
                where: { isActive: true, hashRate: { gt: 0 }, user: { isBanned: false, lastLoginAt: { gte: weekAgo } } },
            }),
            prisma.user.aggregate({ _sum: { polBalance: true } }),
            prisma.user.aggregate({ _sum: { polBalance: true }, where: { isBanned: false } }),
            prisma.transaction.count({ where: { createdAt: { gte: dayAgo } } }),
        ]);
        let miningBlockRewardPol = BLOCK_REWARD_POL_FALLBACK;
        let miningBlockIntervalMinutes = BLOCK_DURATION_MS_FALLBACK / 60000;
        try {
            if (Number.isFinite(Number(miningEngine.rewardBase)))
                miningBlockRewardPol = Number(miningEngine.rewardBase);
            if (Number.isFinite(Number(miningEngine.blockDurationMs)) && Number(miningEngine.blockDurationMs) > 0) {
                miningBlockIntervalMinutes = Number(miningEngine.blockDurationMs) / 60000;
            }
        }
        catch {
            /* engine not booted in some tests */
        }
        let polUsdPrice = 0;
        try {
            polUsdPrice = Number(await getPolUsdPrice()) || 0;
        }
        catch {
            polUsdPrice = 0;
        }
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
                balanceTotalUsd: polUsdPrice > 0 ? balanceTotal * polUsdPrice : null,
                balanceIncludingBanned,
                balanceBanned,
                polUsdPrice,
                transactions24h: tx24h,
                miningBlockRewardPol,
                miningBlockIntervalMinutes,
            },
        });
    }
    catch (error) {
        log.error("Admin stats error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Unable to load admin stats." });
    }
}
export function parsePeriodParam(raw) {
    const s = String(raw ?? "month");
    if (s === "day" || s === "week" || s === "year" || s === "all")
        return s;
    return "month";
}
/** Data real de lançamento do site — mesma fonte usada pela seção "eficiência de mineração"
 *  (getDistribution), reaproveitada aqui pro período "all" (desde o lançamento).
 *  Aceita `YYYY-MM-DD` ou ISO completo (`2026-02-13T00:00:00.000Z`) — em produção o
 *  .env.production usa o formato ISO e concatenar `T00:00:00.000Z` de novo gerava
 *  `Invalid Date` → 500 em /api/admin/analytics (executive summary). */
export function siteLaunchDate() {
    const raw = String(process.env.SITE_LAUNCH_DATE ?? "2026-03-05").trim();
    const fallback = new Date("2026-03-05T00:00:00.000Z");
    if (!raw)
        return fallback;
    const candidate = raw.includes("T") ? raw : `${raw}T00:00:00.000Z`;
    const d = new Date(candidate);
    return Number.isNaN(d.getTime()) ? fallback : d;
}
export function buildBuckets(period, now) {
    const buckets = [];
    let since;
    if (period === "day") {
        since = new Date(now);
        since.setHours(since.getHours() - 23, 0, 0, 0);
        for (let i = 23; i >= 0; i--) {
            const d = new Date(now);
            d.setHours(d.getHours() - i, 0, 0, 0);
            buckets.push({ label: `${String(d.getHours()).padStart(2, "0")}h`, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours() });
        }
    }
    else if (period === "week") {
        since = new Date(now);
        since.setDate(since.getDate() - 7);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
        }
    }
    else if (period === "year") {
        since = new Date(now);
        since.setFullYear(since.getFullYear() - 1);
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.push({ label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }), year: d.getFullYear(), month: d.getMonth() + 1 });
        }
    }
    else if (period === "all") {
        since = siteLaunchDate();
        const monthsSinceLaunch = Math.max(0, (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth()));
        for (let i = monthsSinceLaunch; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.push({ label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }), year: d.getFullYear(), month: d.getMonth() + 1 });
        }
    }
    else {
        since = new Date(now);
        since.setMonth(since.getMonth() - 1);
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
        }
    }
    return { since, buckets };
}
/** GET /api/admin/analytics/executive?period=week — platform KPIs for the overview panel.
 *  Split from the main overview route so /analytics can return charts/summary without waiting
 *  on the heavier deposit/balance/withdrawal aggregates. */
export async function getExecutive(req, res) {
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
    }
    catch (error) {
        log.error("Admin analytics executive error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Erro ao carregar resumo executivo." });
    }
}
/** GET /api/admin/analytics?period=day|week|month|year|all&userId=optional */
export async function getAnalytics(req, res) {
    try {
        const period = parsePeriodParam(req.query.period);
        const userIdNum = queryPositiveInt(req.query.userId);
        const payload = await getOrCompute(`analytics:${period}:${userIdNum ?? "all"}`, () => computeAnalytics(period, userIdNum));
        res.json(payload);
    }
    catch (error) {
        log.error("Admin analytics error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Erro ao carregar analytics." });
    }
}
async function computeAllTimeRewardTotals(userIdNum, userFilter) {
    const [totalDistributed, totalWithdrawals, topEarners] = await Promise.all([
        // Platform-wide total: block_distribution (~21k rows) instead of block_miner_rewards (25M+).
        userIdNum !== undefined
            ? prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true }, where: userFilter })
            : prisma.blockDistribution.aggregate({ _sum: { reward: true } }),
        prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...userFilter, type: "withdrawal", status: "completed" } }),
        userIdNum !== undefined
            ? Promise.resolve(null)
            : prisma.$queryRaw(Prisma.sql `
          SELECT user_id AS "userId", SUM(reward_amount)::float8 AS total
          FROM block_miner_rewards
          GROUP BY user_id
          ORDER BY 2 DESC
          LIMIT 10
        `).then((rows) => rows.map((r) => ({ userId: r.userId, _sum: { rewardAmount: Number(r.total || 0) } }))),
    ]);
    return { totalDistributed, totalWithdrawals, topEarners: topEarners };
}
function totalDistributedPolFromAgg(userIdNum, agg) {
    if (userIdNum !== undefined)
        return Number(agg._sum.rewardAmount || 0);
    return Number(agg._sum.reward ?? agg._sum.rewardAmount ?? 0);
}
/** Platform-wide KPIs for the overview "executive" panel — all-time figures are cached
 *  independently of period; period-scoped fields (new users, deposits, empirical emission)
 *  are recomputed per request. */
async function computeExecutiveSummary(since, periodDistributedPol) {
    const now = Date.now();
    const periodDays = Math.max(1 / 24, (now - since.getTime()) / 86_400_000);
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const allTime = await getOrCompute("analytics:executive:alltime", async () => {
        const [usersTotal, activeMiners, balances, totalDeposits, pendingWd, withdrawalAgg, miningExpected] = await Promise.all([
            prisma.user.count(),
            prisma.userMiner.count({ where: { isActive: true, hashRate: { gt: 0 } } }),
            prisma.user.aggregate({ _sum: { polBalance: true }, where: { isBanned: false } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: "deposit", status: "completed" } }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                _count: { _all: true },
                where: { type: "withdrawal", status: { in: ["pending", "approved"] } },
            }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                _count: { _all: true },
                where: { type: "withdrawal", status: "completed" },
            }),
            getOrCompute("distribution:mining-expected", computeMiningExpected, ALLTIME_TTL_MS),
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
            retentionPercent: depositsTotal > 0 ? Number((((balancesPol + pendingPol) / depositsTotal) * 100).toFixed(2)) : 0,
            withdrawalDepositRatioPercent: depositsTotal > 0 ? Number(((withdrawnTotal / depositsTotal) * 100).toFixed(2)) : 0,
            internalSpendPol: Number(Math.max(0, depositsTotal - balancesPol - withdrawnTotal - pendingPol).toFixed(4)),
            avgWithdrawal: withdrawalCount > 0 ? Number((withdrawnTotal / withdrawalCount).toFixed(4)) : 0,
            miningEfficiencyPercent: miningExpected.efficiencyPercent,
            siteAgeDays: miningExpected.siteAgeDays,
            totalBlocks: miningExpected.actualBlocks,
            theoreticalDailyEmission: Number((miningExpected.blocksPerDay * miningExpected.rewardBase).toFixed(4)),
        };
    }, ALLTIME_TTL_MS);
    const [newUsersInPeriod, periodDeposits, newUsers24h, deposits24h, withdrawals24h] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: since } } }),
        prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: "deposit", status: "completed", createdAt: { gte: since } },
        }),
        prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
        prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: "deposit", status: "completed", createdAt: { gte: dayAgo } },
        }),
        prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { type: "withdrawal", status: "completed", createdAt: { gte: dayAgo } },
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
async function computeAnalytics(period, userIdNum) {
    {
        let polPrice = 0.35;
        try {
            polPrice = await getPolUsdPrice();
        }
        catch {
            /* keep fallback */
        }
        const BLOCK_REWARD = Number.isFinite(Number(miningEngine.rewardBase)) ? Number(miningEngine.rewardBase) : BLOCK_REWARD_POL_FALLBACK;
        const BLOCK_DURATION_MS = Number.isFinite(Number(miningEngine.blockDurationMs)) && Number(miningEngine.blockDurationMs) > 0
            ? Number(miningEngine.blockDurationMs)
            : BLOCK_DURATION_MS_FALLBACK;
        const BLOCKS_PER_DAY = (24 * 60 * 60 * 1000) / BLOCK_DURATION_MS;
        const BLOCKS_PER_MONTH = BLOCKS_PER_DAY * 30;
        const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365;
        const now = new Date();
        const { since, buckets: months } = buildBuckets(period, now);
        const userFilter = userIdNum !== undefined ? { userId: userIdNum } : {};
        const unit = period === "day" ? "hour" : period === "year" || period === "all" ? "month" : "day";
        const userClause = userIdNum !== undefined ? Prisma.sql `AND user_id = ${userIdNum}` : Prisma.empty;
        const [{ totalDistributed, totalWithdrawals, topEarners }, periodDistributed, rewardsOverTime, periodWithdrawals, activeUsersCount, blockCount, totalBlocksEver, networkHashData,] = await Promise.all([
            // block_miner_rewards has 25M+ rows and grows forever — an all-time SUM/groupBy over
            // it with no date filter always costs seconds no matter the index, so this triple is
            // cached under its own period-independent key instead of being recomputed on every
            // period switch (see computeAllTimeRewardTotals below).
            getOrCompute(`analytics:alltime:${userIdNum ?? "all"}`, () => computeAllTimeRewardTotals(userIdNum, userFilter), ALLTIME_TTL_MS),
            prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            prisma.$queryRaw(Prisma.sql `
        SELECT date_trunc(${unit}, created_at) AS bucket,
               COALESCE(SUM(reward_amount), 0)::float8 AS total
        FROM block_miner_rewards
        WHERE created_at >= ${since} ${userClause}
        GROUP BY 1
      `),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...userFilter, type: "withdrawal", status: "completed", createdAt: { gte: since } } }),
            userIdNum !== undefined
                ? Promise.resolve(null)
                : prisma.$queryRaw(Prisma.sql `
            SELECT COUNT(DISTINCT user_id)::int AS cnt
            FROM block_miner_rewards
            WHERE created_at >= ${since}
          `).then((r) => r[0]?.cnt ?? 0),
            userIdNum !== undefined ? Promise.resolve(null) : prisma.blockDistribution.count({ where: { createdAt: { gte: since } } }),
            prisma.blockDistribution.count(),
            prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true } }),
        ]);
        let userHashRate = 0;
        if (userIdNum !== undefined) {
            const uhr = await prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { userId: userIdNum, isActive: true } });
            userHashRate = Number(uhr._sum.hashRate || 0);
        }
        const networkHashRate = Number(networkHashData._sum.hashRate || 1);
        const shareRatio = userIdNum !== undefined && networkHashRate > 0 ? userHashRate / networkHashRate : 1;
        const forecastDay = BLOCKS_PER_DAY * BLOCK_REWARD * shareRatio;
        const forecastWeek = BLOCKS_PER_DAY * 7 * BLOCK_REWARD * shareRatio;
        const forecastMonth = BLOCKS_PER_MONTH * BLOCK_REWARD * shareRatio;
        const forecastYear = BLOCKS_PER_YEAR * BLOCK_REWARD * shareRatio;
        let topEarnersWithInfo = [];
        if (topEarners) {
            const userIds = topEarners.map((e) => e.userId);
            const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, email: true } });
            const uMap = new Map(users.map((u) => [u.id, u]));
            topEarnersWithInfo = topEarners.map((e) => ({
                userId: e.userId,
                username: uMap.get(e.userId)?.username || uMap.get(e.userId)?.email || `#${e.userId}`,
                total: Number(e._sum.rewardAmount || 0),
                totalUsd: Number(e._sum.rewardAmount || 0) * polPrice,
            }));
        }
        const bucketKey = (d, hour) => {
            if (unit === "hour")
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(hour ?? d.getHours?.() ?? 0).padStart(2, "0")}`;
            if (unit === "month")
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };
        const buckets = {};
        for (const r of rewardsOverTime) {
            const d = new Date(r.bucket);
            const key = bucketKey(d);
            buckets[key] = (buckets[key] || 0) + Number(r.total);
        }
        const chartData = months.map((m) => {
            const key = bucketKey({ getFullYear: () => m.year, getMonth: () => m.month - 1, getDate: () => m.day ?? 0 }, m.hour);
            const pol = Number((buckets[key] || 0).toFixed(8));
            return { label: m.label, value: pol, valueUsd: pol * polPrice };
        });
        let userRecentBlocks = null;
        if (userIdNum !== undefined) {
            userRecentBlocks = await prisma.blockMinerReward.findMany({
                where: { userId: userIdNum },
                orderBy: { createdAt: "desc" },
                take: 50,
                include: { block: { select: { blockNumber: true, reward: true } } },
            });
        }
        const totalDistributedPol = totalDistributedPolFromAgg(userIdNum, totalDistributed);
        const periodDistributedPol = Number(periodDistributed._sum.rewardAmount || 0);
        const totalWithdrawalsPol = Number(totalWithdrawals._sum.amount || 0);
        const periodWithdrawalsPol = Number(periodWithdrawals._sum.amount || 0);
        return {
            ok: true,
            polPrice,
            summary: {
                totalDistributed: totalDistributedPol,
                totalDistributedUsd: totalDistributedPol * polPrice,
                periodDistributed: periodDistributedPol,
                periodDistributedUsd: periodDistributedPol * polPrice,
                totalWithdrawals: totalWithdrawalsPol,
                totalWithdrawalsUsd: totalWithdrawalsPol * polPrice,
                periodWithdrawals: periodWithdrawalsPol,
                periodWithdrawalsUsd: periodWithdrawalsPol * polPrice,
                activeUsers: activeUsersCount ?? null,
                blockCount: blockCount ?? null,
                totalBlocksEver,
                networkHashRate,
                userHashRate: userIdNum !== undefined ? userHashRate : null,
                period,
            },
            forecast: {
                day: { pol: forecastDay, usd: forecastDay * polPrice },
                week: { pol: forecastWeek, usd: forecastWeek * polPrice },
                month: { pol: forecastMonth, usd: forecastMonth * polPrice },
                year: { pol: forecastYear, usd: forecastYear * polPrice },
                sharePercent: userIdNum !== undefined ? shareRatio * 100 : null,
                networkHashRate,
                userHashRate: userIdNum !== undefined ? userHashRate : null,
            },
            topEarners: topEarnersWithInfo,
            chartData,
            userRecentBlocks,
        };
    }
}
/** Same period semantics as buildBuckets() above, but returns from/to Date ranges instead of
 *  year/month/day parts — matches legacy's resolveAnalyticsPeriod() shape, needed for the
 *  date_trunc bucket-key lookups below. */
export function resolveAnalyticsPeriod(raw) {
    const period = parsePeriodParam(raw);
    const now = new Date();
    const buckets = [];
    let since;
    if (period === "day") {
        since = new Date(now);
        since.setHours(since.getHours() - 23, 0, 0, 0);
        for (let i = 23; i >= 0; i--) {
            const d = new Date(now);
            d.setHours(d.getHours() - i, 0, 0, 0);
            const end = new Date(d);
            end.setHours(end.getHours() + 1);
            buckets.push({ label: `${String(d.getHours()).padStart(2, "0")}h`, from: d, to: end });
        }
        return { period, since, buckets, bucketUnit: "hour" };
    }
    if (period === "week") {
        since = new Date(now);
        since.setDate(since.getDate() - 6);
        since.setHours(0, 0, 0, 0);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const end = new Date(d);
            end.setDate(end.getDate() + 1);
            buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, from: d, to: end });
        }
        return { period, since, buckets, bucketUnit: "day" };
    }
    if (period === "year") {
        since = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            buckets.push({ label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }), from: d, to: end });
        }
        return { period, since, buckets, bucketUnit: "month" };
    }
    if (period === "all") {
        since = siteLaunchDate();
        const monthsSinceLaunch = Math.max(0, (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth()));
        for (let i = monthsSinceLaunch; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            buckets.push({ label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit" }), from: d, to: end });
        }
        return { period, since, buckets, bucketUnit: "month" };
    }
    since = new Date(now);
    since.setDate(since.getDate() - 29);
    since.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setDate(end.getDate() + 1);
        buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, from: d, to: end });
    }
    return { period, since, buckets, bucketUnit: "day" };
}
export function bucketKeyFor(d, unit) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    if (unit === "month")
        return `${y}-${m}`;
    const day = String(d.getDate()).padStart(2, "0");
    if (unit === "hour")
        return `${y}-${m}-${day}-${String(d.getHours()).padStart(2, "0")}`;
    return `${y}-${m}-${day}`;
}
/** GET /api/admin/analytics/inflation?period=week|month|year — per-bucket POL distributed
 *  (mining) vs POL withdrawn, plus a running cumulative net-supply curve. */
export async function getInflation(req, res) {
    try {
        const period = parsePeriodParam(req.query.period);
        const payload = await getOrCompute(`analytics:inflation:${period}`, () => computeInflation(period));
        res.json(payload);
    }
    catch (error) {
        log.error("Admin analytics inflation error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Erro ao carregar inflação." });
    }
}
async function computeInflation(period) {
    const { period: p, since, buckets, bucketUnit } = resolveAnalyticsPeriod(period);
    let polPrice = 0.35;
    try {
        polPrice = await getPolUsdPrice();
    }
    catch {
        /* keep fallback */
    }
    const unit = bucketUnit;
    const [distributedBuckets, withdrawalBuckets, totalDistributedAgg, totalWithdrawnAgg] = await Promise.all([
        prisma.$queryRaw(Prisma.sql `
      SELECT date_trunc(${unit}, created_at) AS bucket, COALESCE(SUM(reward_amount), 0)::float8 AS total
      FROM block_miner_rewards WHERE created_at >= ${since} GROUP BY 1
    `),
        prisma.$queryRaw(Prisma.sql `
      SELECT date_trunc(${unit}, created_at) AS bucket, COALESCE(SUM(amount), 0)::float8 AS total
      FROM transactions WHERE type = 'withdrawal' AND status = 'completed' AND created_at >= ${since} GROUP BY 1
    `),
        getOrCompute("analytics:mining-distributed-alltime", () => prisma.blockDistribution.aggregate({ _sum: { reward: true } }), ALLTIME_TTL_MS),
        getOrCompute("analytics:withdrawn-alltime", () => prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: "withdrawal", status: "completed" } }), ALLTIME_TTL_MS),
    ]);
    const distMap = {};
    for (const r of distributedBuckets)
        distMap[bucketKeyFor(new Date(r.bucket), bucketUnit)] = Number(r.total || 0);
    const wMap = {};
    for (const r of withdrawalBuckets)
        wMap[bucketKeyFor(new Date(r.bucket), bucketUnit)] = Number(r.total || 0);
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
        return { label: b.label, distributed, withdrawn, net: Number(net.toFixed(8)), cumulative: Number(cumulative.toFixed(8)) };
    });
    const avgDailyDistributed = bucketUnit === "day" && series.length > 0 ? periodDistributedTotal / series.length : 0;
    const avgDailyWithdrawn = bucketUnit === "day" && series.length > 0 ? periodWithdrawnTotal / series.length : 0;
    const netInflationRate = totalDistributedAll > 0 ? ((totalDistributedAll - totalWithdrawnAll) / totalDistributedAll) * 100 : 0;
    return {
        ok: true,
        period: p,
        polPrice,
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
/** GET /api/admin/analytics/projections?period=day|week|month|year|all&userId=optional —
 *  1/7/30/90/365-day theoretical forecast from live engine constants, plus an empirical
 *  forecast from real actuals over the selected period's window (bug fixed 11/08/2026: this
 *  handler used to completely ignore `period` and always average the last hardcoded 30 days —
 *  the period selector visibly did nothing on this tab, "n ta mudando"). */
export async function getProjections(req, res) {
    try {
        const period = parsePeriodParam(req.query.period);
        const userIdNum = queryPositiveInt(req.query.userId);
        const payload = await getOrCompute(`analytics:projections:${period}:${userIdNum ?? "all"}`, () => computeProjections(period, userIdNum));
        res.json(payload);
    }
    catch (error) {
        log.error("Admin analytics projections error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Erro ao carregar projeções." });
    }
}
async function computeProjections(period, userIdNum) {
    let polPrice = 0.35;
    try {
        polPrice = await getPolUsdPrice();
    }
    catch {
        /* keep fallback */
    }
    const BLOCK_REWARD = Number.isFinite(Number(miningEngine.rewardBase)) ? Number(miningEngine.rewardBase) : BLOCK_REWARD_POL_FALLBACK;
    const BLOCK_DURATION_MS = Number.isFinite(Number(miningEngine.blockDurationMs)) && Number(miningEngine.blockDurationMs) > 0
        ? Number(miningEngine.blockDurationMs)
        : BLOCK_DURATION_MS_FALLBACK;
    const BLOCKS_PER_DAY = (24 * 60 * 60 * 1000) / BLOCK_DURATION_MS;
    const now = new Date();
    const windowSince = period === "day"
        ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
        : period === "week"
            ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            : period === "year"
                ? new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
                : period === "all"
                    ? siteLaunchDate()
                    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windowDays = Math.max(1 / 24, (now.getTime() - windowSince.getTime()) / 86_400_000);
    const windowAggPromise = userIdNum !== undefined
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
            ? prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true, userId: userIdNum } })
            : Promise.resolve(null),
        windowAggPromise,
    ]);
    const networkHashRate = Number(netAgg._sum.hashRate || 0);
    const userHashRate = userAgg ? Number(userAgg._sum.hashRate || 0) : 0;
    const share = userIdNum !== undefined && networkHashRate > 0 ? userHashRate / networkHashRate : 1;
    const theo = (days) => BLOCKS_PER_DAY * BLOCK_REWARD * share * days;
    const windowTotal = userIdNum !== undefined
        ? Number(windowAgg._sum.rewardAmount || 0)
        : Number(windowAgg._sum.reward || 0);
    const empiricalDaily = windowAgg._count._all > 0 ? windowTotal / windowDays : 0;
    const empirical = (days) => empiricalDaily * days;
    return {
        ok: true,
        period,
        polPrice,
        networkHashRate,
        userHashRate: userIdNum !== undefined ? userHashRate : null,
        sharePercent: userIdNum !== undefined ? share * 100 : null,
        theoretical: { day1: theo(1), day7: theo(7), day30: theo(30), day90: theo(90), day365: theo(365) },
        empirical: {
            windowDays: Number(windowDays.toFixed(2)),
            avgDaily: empiricalDaily,
            day7: empirical(7),
            day30: empirical(30),
            day90: empirical(90),
        },
        assumptions: { blockRewardPol: BLOCK_REWARD, blocksPerDay: BLOCKS_PER_DAY },
    };
}
/** GET /api/admin/analytics/withdrawals?period=&userId= — mean/median/P90/P99 amounts,
 *  avg/median time-to-complete, per-period status breakdown and a bucketed series. */
export async function getWithdrawalStats(req, res) {
    try {
        const period = parsePeriodParam(req.query.period);
        const userIdNum = queryPositiveInt(req.query.userId);
        const payload = await getOrCompute(`analytics:withdrawals:${period}:${userIdNum ?? "all"}`, () => computeWithdrawalStats(period, userIdNum));
        res.json(payload);
    }
    catch (error) {
        log.error("Admin analytics withdrawals error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Erro ao carregar saques." });
    }
}
async function computeWithdrawalStats(period, userIdNum) {
    const { period: p, since, buckets, bucketUnit } = resolveAnalyticsPeriod(period);
    let polPrice = 0.35;
    try {
        polPrice = await getPolUsdPrice();
    }
    catch {
        /* keep fallback */
    }
    const unit = bucketUnit;
    const userClause = userIdNum !== undefined ? Prisma.sql `AND user_id = ${userIdNum}` : Prisma.empty;
    const [statsRow, statusRows, seriesRows] = await Promise.all([
        getOrCompute(`analytics:withdrawal-stats-alltime:${userIdNum ?? "all"}`, () => prisma.$queryRaw(Prisma.sql `
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
        `), ALLTIME_TTL_MS),
        prisma.$queryRaw(Prisma.sql `
      SELECT LOWER(status) AS status, COUNT(*) AS cnt
      FROM transactions
      WHERE type = 'withdrawal' AND created_at >= ${since} ${userClause}
      GROUP BY 1
    `),
        prisma.$queryRaw(Prisma.sql `
      SELECT date_trunc(${unit}, created_at) AS bucket,
             COUNT(*) AS cnt,
             COALESCE(SUM(amount), 0)::float8 AS amount
      FROM transactions
      WHERE type = 'withdrawal' AND status = 'completed' AND created_at >= ${since} ${userClause}
      GROUP BY 1
    `),
    ]);
    const s = statsRow[0] ?? { cnt: 0n, total: 0, avg: 0, median: 0, p90: 0, p99: 0, avg_ttc_ms: 0, median_ttc_ms: 0 };
    const statusCount = { completed: 0, pending: 0, failed: 0, other: 0 };
    for (const r of statusRows) {
        const n = Number(r.cnt);
        if (r.status === "completed")
            statusCount.completed += n;
        else if (r.status === "pending")
            statusCount.pending += n;
        else if (r.status === "failed")
            statusCount.failed += n;
        else
            statusCount.other += n;
    }
    const bucketMap = {};
    for (const r of seriesRows) {
        bucketMap[bucketKeyFor(new Date(r.bucket), bucketUnit)] = { count: Number(r.cnt), amount: Number(r.amount || 0) };
    }
    const series = buckets.map((b) => {
        const k = bucketKeyFor(b.from, bucketUnit);
        const cur = bucketMap[k] || { count: 0, amount: 0 };
        return { label: b.label, count: cur.count, amount: Number(cur.amount.toFixed(8)) };
    });
    return {
        ok: true,
        period: p,
        polPrice,
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
/** GET /api/admin/analytics/distribution?period=&userId= — POL inflow breakdown by source
 *  (mining / referrals / PTC / offerwall / reward-inbox / manual credit), plus outflows
 *  (withdrawals) and an all-time mining-efficiency section (expected vs actual blocks). */
export async function getDistribution(req, res) {
    try {
        const { period, since } = resolveAnalyticsPeriod(req.query.period);
        const userIdNum = queryPositiveInt(req.query.userId);
        const payload = await getOrCompute(`distribution:${period}:${userIdNum ?? "all"}`, () => computeDistribution(period, since, userIdNum));
        res.json(payload);
    }
    catch (error) {
        log.error("Admin analytics distribution error", { error: error instanceof Error ? error.message : String(error) });
        res.status(500).json({ ok: false, message: "Erro ao carregar distribuição." });
    }
}
/** All-time and independent of `period`/`userId` — cached under its own key so switching
 *  tabs/periods doesn't recompute it (it never changes based on either param). */
async function computeMiningExpected() {
    const launchDate = siteLaunchDate();
    const now = new Date();
    const ageMs = Math.max(0, now.getTime() - launchDate.getTime());
    const ageDays = ageMs / 86400000;
    let rewardBase = BLOCK_REWARD_POL_FALLBACK;
    let blockDurationMs = BLOCK_DURATION_MS_FALLBACK;
    try {
        if (Number.isFinite(Number(miningEngine.rewardBase)))
            rewardBase = Number(miningEngine.rewardBase);
        if (Number.isFinite(Number(miningEngine.blockDurationMs)) && Number(miningEngine.blockDurationMs) > 0) {
            blockDurationMs = Number(miningEngine.blockDurationMs);
        }
    }
    catch {
        /* engine not booted in some tests */
    }
    const blocksPerDay = 86400000 / blockDurationMs;
    const expectedBlocks = ageDays * blocksPerDay;
    const expectedPol = expectedBlocks * rewardBase;
    const [actualMiningAllTime, actualBlocksAllTime] = await Promise.all([
        prisma.blockDistribution.aggregate({ _sum: { reward: true } }),
        prisma.blockDistribution.count(),
    ]);
    const actualPol = Number(actualMiningAllTime._sum.reward || 0);
    const efficiency = expectedPol > 0 ? (actualPol / expectedPol) * 100 : 0;
    return {
        launchDate: launchDate.toISOString(),
        siteAgeDays: Math.floor(ageDays * 10) / 10,
        rewardBase,
        blockDurationMinutes: blockDurationMs / 60000,
        blocksPerDay: Math.round(blocksPerDay),
        expectedBlocks: Math.round(expectedBlocks),
        expectedPol: Number(expectedPol.toFixed(4)),
        actualBlocks: actualBlocksAllTime,
        actualPol: Number(actualPol.toFixed(4)),
        efficiencyPercent: Number(efficiency.toFixed(2)),
        missingBlocks: Math.max(0, Math.round(expectedBlocks) - actualBlocksAllTime),
        missingPol: Number(Math.max(0, expectedPol - actualPol).toFixed(4)),
    };
}
async function computeDistribution(period, since, userIdNum) {
    {
        let polPrice = 0.35;
        try {
            polPrice = await getPolUsdPrice();
        }
        catch {
            /* keep fallback */
        }
        const userFilter = userIdNum !== undefined ? { userId: userIdNum } : {};
        const referrerFilter = userIdNum !== undefined ? { referrerId: userIdNum } : {};
        const [miningAgg, referralAgg, zeradsAgg, offerwallMeAgg, inboxAgg, adminCreditAgg, withdrawalsAgg, depositsAgg] = await Promise.all([
            // Mining source: network-wide → blockDistribution (actual minted POL = blocks × rewardBase).
            // User-filtered → keep that user's miner shares (their mining income).
            userIdNum !== undefined
                ? prisma.blockMinerReward
                    .aggregate({ _sum: { rewardAmount: true }, _count: { _all: true }, where: { userId: userIdNum, createdAt: { gte: since } } })
                    .then((a) => ({ pol: Number(a._sum.rewardAmount || 0), count: a._count._all }))
                : prisma.blockDistribution
                    .aggregate({ _sum: { reward: true }, _count: { _all: true }, where: { createdAt: { gte: since } } })
                    .then((a) => ({ pol: Number(a._sum.reward || 0), count: a._count._all })),
            prisma.referralEarning.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...referrerFilter, createdAt: { gte: since } } }),
            prisma.zeradsCallback.aggregate({ _sum: { payoutAmount: true }, _count: { _all: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            prisma.offerwallMeCallback.aggregate({ _sum: { polCredited: true }, _count: { _all: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            prisma.userRewardInbox.aggregate({
                _sum: { rewardValue: true },
                _count: { _all: true },
                where: { ...userFilter, status: "collected", rewardType: "pol", collectedAt: { gte: since } },
            }),
            prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...userFilter, type: "admin_credit", status: "completed", createdAt: { gte: since } } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...userFilter, type: "withdrawal", status: "completed", createdAt: { gte: since } } }),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                _count: { _all: true },
                where: { ...userFilter, type: "deposit", status: "completed", txHash: { not: null }, createdAt: { gte: since } },
            }),
        ]);
        const sources = [
            { key: "mining", label: "Mineração (blocos)", pol: miningAgg.pol, count: miningAgg.count },
            { key: "referral", label: "Indicações", pol: Number(referralAgg._sum.amount || 0), count: referralAgg._count._all },
            { key: "zerads", label: "PTC (ZerAds)", pol: Number(zeradsAgg._sum.payoutAmount || 0), count: zeradsAgg._count._all },
            { key: "offerwallme", label: "Offerwall (OfferwallMe)", pol: Number(offerwallMeAgg._sum.polCredited || 0), count: offerwallMeAgg._count._all },
            { key: "inbox", label: "Inbox de recompensas (faucet/checkin/tasks)", pol: Number(inboxAgg._sum.rewardValue || 0), count: inboxAgg._count._all },
            { key: "admin_credit", label: "Crédito manual (admin)", pol: Number(adminCreditAgg._sum.amount || 0), count: adminCreditAgg._count._all },
        ];
        const inflowTotal = sources.reduce((s, x) => s + x.pol, 0);
        const outflows = [{ key: "withdrawals", label: "Saques", pol: Number(withdrawalsAgg._sum.amount || 0), count: withdrawalsAgg._count._all }];
        const depositsInflow = { key: "deposits", label: "Depósitos (entrada externa)", pol: Number(depositsAgg._sum.amount || 0), count: depositsAgg._count._all };
        // ---- Mining efficiency (Real × Expected) — always all-time, independent of period/userId,
        // so it's cached under its own key (see computeMiningExpected above).
        const miningExpected = await getOrCompute("distribution:mining-expected", computeMiningExpected, ALLTIME_TTL_MS);
        return {
            ok: true,
            period,
            polPrice,
            sources: sources.map((s) => ({ ...s, sharePercent: inflowTotal > 0 ? (s.pol / inflowTotal) * 100 : 0 })),
            totalInflowFromSources: inflowTotal,
            depositsInflow,
            outflows,
            miningExpected,
        };
    }
}
