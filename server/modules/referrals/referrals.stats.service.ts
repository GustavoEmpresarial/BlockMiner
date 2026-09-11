// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/referrals/referrals.stats.service.ts.
 * Tournament deposit filter inlined in referrals.constants (Fase 7 not migrated).
 */
import prisma from "../../core/database/prisma.js";
import { REFERRAL_MINING_COMMISSION_RATE, REFERRAL_STATS_SINCE, countsForDepositTournament, } from "./referrals.constants.js";
import { generateUniqueRefCode } from "../auth/index.js";
function roundPol(n) {
    return Math.round(n * 1e8) / 1e8;
}
function roundShib(n) {
    return Math.round(n * 1e8) / 1e8;
}
function roundUsd(n) {
    return Math.round(n * 100) / 100;
}
function depositEventAt(row) {
    return row.confirmedEventAt ?? row.completedAt ?? row.createdAt;
}
function aggregateReferralDeposits(rows, since) {
    const byUser = new Map();
    let totalPol = 0;
    let totalUsd = 0;
    let hasUsd = false;
    let depositCount = 0;
    for (const row of rows) {
        if (!countsForDepositTournament(row.rawTx))
            continue;
        if (depositEventAt(row) < since)
            continue;
        const pol = Number(row.amount) || 0;
        const usdRaw = row.usdValueAtConfirmation;
        const usd = usdRaw != null && Number.isFinite(Number(usdRaw)) ? Number(usdRaw) : null;
        const prev = byUser.get(row.userId) ?? { depositedPol: 0, depositedUsd: null, depositCount: 0 };
        const nextUsd = usd != null
            ? roundUsd((prev.depositedUsd ?? 0) + usd)
            : prev.depositedUsd;
        byUser.set(row.userId, {
            depositedPol: roundPol(prev.depositedPol + pol),
            depositedUsd: nextUsd,
            depositCount: prev.depositCount + 1,
        });
        totalPol = roundPol(totalPol + pol);
        depositCount += 1;
        if (usd != null) {
            hasUsd = true;
            totalUsd = roundUsd(totalUsd + usd);
        }
    }
    return {
        byUser,
        summary: {
            depositedPol: totalPol,
            depositedUsd: hasUsd ? totalUsd : null,
            depositCount,
        },
    };
}
async function loadReferralDepositRows(referredUserIds) {
    if (referredUserIds.length === 0)
        return [];
    return prisma.transaction.findMany({
        where: {
            userId: { in: referredUserIds },
            type: "deposit",
            status: "completed",
        },
        select: {
            userId: true,
            amount: true,
            rawTx: true,
            completedAt: true,
            createdAt: true,
            confirmedEventAt: true,
            usdValueAtConfirmation: true,
        },
    });
}
export async function getUserReferralStats(userId) {
    const since = REFERRAL_STATS_SINCE;
    let user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, refCode: true },
    });
    if (!user) {
        throw new Error("user_not_found");
    }
    // item 97: garante que TODO usuário tem um refCode real de verdade antes de devolvê-lo pro
    // frontend montar o link de indicação — mesmo padrão de lazy-backfill já usado em
    // mining.repository.ts's getOrCreateMinerProfile. Sem isto, `buildReferralLink` (client)
    // cai no fallback pro ID numérico bruto, que é exatamente o vetor de farming do pentest
    // (IDs sequenciais e enumeráveis) que o item 97 fecha do lado do servidor.
    if (!user.refCode) {
        const refCode = await generateUniqueRefCode();
        user = await prisma.user.update({ where: { id: userId }, data: { refCode }, select: { id: true, refCode: true } });
    }
    const [totalsAgg, shibAgg, earningsCount, referrals, referredEarnings, dailyRows, bySourceRows,] = await Promise.all([
        prisma.referralEarning.aggregate({
            _sum: { amount: true },
            where: { referrerId: userId, createdAt: { gte: since } },
        }),
        prisma.referralEarning.aggregate({
            _sum: { amountShib: true },
            where: { referrerId: userId, createdAt: { gte: since } },
        }),
        prisma.referralEarning.count({
            where: { referrerId: userId, createdAt: { gte: since } },
        }),
        prisma.referral.findMany({
            where: { referrerId: userId },
            include: {
                referred: {
                    select: { id: true, username: true, name: true, createdAt: true },
                },
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.referralEarning.groupBy({
            by: ["referredId"],
            where: { referrerId: userId, createdAt: { gte: since } },
            _sum: { amount: true, amountShib: true },
            _count: { _all: true },
        }),
        prisma.$queryRaw `
      SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
             COALESCE(SUM(amount), 0)::float AS pol,
             COALESCE(SUM(amount_shib), 0)::float AS shib
      FROM referral_earnings
      WHERE referrer_id = ${userId}
        AND created_at >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
        prisma.$queryRaw `
      SELECT source,
             COALESCE(SUM(amount), 0)::float AS pol,
             COALESCE(SUM(amount_shib), 0)::float AS shib,
             COUNT(*)::bigint AS cnt
      FROM referral_earnings
      WHERE referrer_id = ${userId}
        AND created_at >= ${since}
      GROUP BY source
      ORDER BY pol DESC
    `,
    ]);
    const earningsByReferred = new Map(referredEarnings.map((row) => [row.referredId, row]));
    const referredUserIds = referrals.map((row) => row.referredId);
    const depositRows = await loadReferralDepositRows(referredUserIds);
    const { byUser: depositsByUser, summary: depositSummary } = aggregateReferralDeposits(depositRows, since);
    const referredUsers = referrals.map((row) => {
        const earnings = earningsByReferred.get(row.referredId);
        const deposits = depositsByUser.get(row.referredId);
        const username = row.referred.username?.trim() || row.referred.name?.trim() || `user-${row.referred.id}`;
        return {
            userId: row.referred.id,
            username,
            joinedAt: row.referred.createdAt.toISOString(),
            referredAt: row.createdAt.toISOString(),
            earningsPol: roundPol(Number(earnings?._sum.amount ?? 0)),
            earningsShib: roundShib(Number(earnings?._sum.amountShib ?? 0)),
            transactionCount: earnings?._count._all ?? 0,
            depositedPol: deposits?.depositedPol ?? 0,
            depositedUsd: deposits?.depositedUsd ?? null,
            depositCount: deposits?.depositCount ?? 0,
        };
    });
    referredUsers.sort((a, b) => b.depositedPol - a.depositedPol ||
        b.earningsPol - a.earningsPol ||
        b.earningsShib - a.earningsShib ||
        b.transactionCount - a.transactionCount);
    const activeInPeriod = referredUsers.filter((u) => u.transactionCount > 0).length;
    const referredJoinedSince = referrals.filter((r) => r.createdAt >= since).length;
    return {
        statsSince: since.toISOString().slice(0, 10),
        commissionRate: REFERRAL_MINING_COMMISSION_RATE,
        refCode: user.refCode,
        referralId: user.id,
        summary: {
            totalReferred: referrals.length,
            referredJoinedSince,
            activeInPeriod,
            totalEarningsPol: roundPol(Number(totalsAgg._sum.amount ?? 0)),
            totalEarningsShib: roundShib(Number(shibAgg._sum.amountShib ?? 0)),
            earningsCount,
            totalDepositedPol: depositSummary.depositedPol,
            totalDepositedUsd: depositSummary.depositedUsd,
            depositCount: depositSummary.depositCount,
        },
        referredUsers,
        daily: dailyRows.map((row) => ({
            date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
            pol: roundPol(Number(row.pol) || 0),
            shib: roundShib(Number(row.shib) || 0),
        })),
        bySource: bySourceRows.map((row) => ({
            source: row.source,
            pol: roundPol(Number(row.pol) || 0),
            shib: roundShib(Number(row.shib) || 0),
            count: Number(row.cnt) || 0,
        })),
    };
}
