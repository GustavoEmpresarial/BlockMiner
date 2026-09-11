import prisma from "../../core/database/prisma.js";
const DETAIL_LIMIT = 200;
export function parseDepositSource(rawTx) {
    if (!rawTx)
        return null;
    try {
        const j = JSON.parse(rawTx);
        return typeof j.source === "string" ? j.source : null;
    }
    catch {
        return null;
    }
}
/**
 * All confirmed deposit sources count for deposit tournaments (treasury, contract, HD).
 */
export function countsForDepositTournament(_rawTx) {
    return true;
}
function eventTimeUtc(row) {
    return row.confirmedEventAt ?? row.completedAt ?? row.createdAt ?? new Date(0);
}
async function loadTournamentDepositRows(startsAt, upperBound, userId) {
    const userFilter = userId != null ? { userId } : {};
    const rows = await prisma.transaction.findMany({
        where: {
            ...userFilter,
            type: "deposit",
            status: "completed",
            OR: [
                { completedAt: { gte: startsAt, lte: upperBound } },
                { completedAt: null, createdAt: { gte: startsAt, lte: upperBound } },
            ],
        },
        select: {
            id: true,
            userId: true,
            amount: true,
            completedAt: true,
            createdAt: true,
            txHash: true,
            rawTx: true,
            confirmedEventAt: true,
            usdValueAtConfirmation: true,
            usdRateAtConfirmation: true,
        },
    });
    const eligible = rows.filter((r) => countsForDepositTournament(r.rawTx));
    const inWindow = [];
    for (const row of eligible) {
        const at = eventTimeUtc(row);
        if (at >= startsAt && at <= upperBound)
            inWindow.push(row);
    }
    return inWindow;
}
/** @deprecated kept for tests of filter shape */
export function depositInWindowWhere(startsAt, upperBound, userId) {
    const userFilter = userId != null ? { userId } : {};
    return {
        ...userFilter,
        type: "deposit",
        status: "completed",
        OR: [
            { completedAt: { gte: startsAt, lte: upperBound } },
            { completedAt: null, createdAt: { gte: startsAt, lte: upperBound } },
        ],
    };
}
export function depositPendingInWindowWhere(startsAt, upperBound, userId) {
    const userFilter = userId != null ? { userId } : {};
    return {
        ...userFilter,
        type: "deposit",
        status: "pending_verification",
        createdAt: { gte: startsAt, lte: upperBound },
    };
}
export async function computeDepositScores(startsAt, upperBound, opts) {
    const rows = await loadTournamentDepositRows(startsAt, upperBound, opts?.userId);
    const map = new Map();
    for (const r of rows) {
        if (r.userId == null)
            continue;
        const prev = map.get(r.userId) ?? { total: 0, txCount: 0 };
        const amount = Number(r.amount);
        map.set(r.userId, {
            total: prev.total + amount,
            txCount: prev.txCount + 1,
        });
    }
    return map;
}
/** Sum confirmed USD per user (all deposit sources; uses confirmedEventAt window). */
export async function computeDepositUsdScores(startsAt, upperBound, opts) {
    const rows = await loadTournamentDepositRows(startsAt, upperBound, opts?.userId);
    const map = new Map();
    for (const r of rows) {
        if (r.userId == null)
            continue;
        const usd = Number(r.usdValueAtConfirmation ?? 0);
        if (!(usd > 0) || !Number.isFinite(usd))
            continue;
        const prev = map.get(r.userId) ?? { total: 0, txCount: 0 };
        map.set(r.userId, {
            total: prev.total + usd,
            txCount: prev.txCount + 1,
        });
    }
    return map;
}
export async function computeDepositScoreForUser(userId, startsAt, upperBound) {
    const map = await computeDepositScores(startsAt, upperBound, { userId });
    return map.get(userId) ?? { total: 0, txCount: 0 };
}
export async function aggregateDepositSummary(startsAt, upperBound) {
    const rows = await loadTournamentDepositRows(startsAt, upperBound);
    const participants = new Set(rows.map((r) => r.userId).filter((id) => id != null));
    let totalPol = 0;
    let totalUsd = 0;
    let hasUsd = false;
    let largestPol = 0;
    let largestUsd = 0;
    for (const r of rows) {
        const amount = Number(r.amount);
        totalPol += amount;
        if (amount > largestPol)
            largestPol = amount;
        const usdRaw = r.usdValueAtConfirmation;
        if (usdRaw != null) {
            const usd = Number(usdRaw);
            if (Number.isFinite(usd)) {
                hasUsd = true;
                totalUsd += usd;
                if (usd > largestUsd)
                    largestUsd = usd;
            }
        }
    }
    const txCount = rows.length;
    const remainderPol = Math.max(0, totalPol - largestPol);
    const remainderUsd = hasUsd ? Math.max(0, totalUsd - largestUsd) : null;
    const remainderTxCount = Math.max(0, txCount - (largestPol > 0 ? 1 : 0));
    return {
        rankingUnit: "pol_legacy",
        totalPol,
        totalUsd: hasUsd ? totalUsd : null,
        txCount,
        participantCount: participants.size,
        largestDepositPol: largestPol,
        largestDepositUsd: hasUsd ? largestUsd : null,
        remainderPol,
        remainderUsd,
        remainderTxCount,
    };
}
export async function getDepositScoreDetailForUser(userId, startsAt, upperBound) {
    const [allCompleted, pendingInWindow] = await Promise.all([
        prisma.transaction.findMany({
            where: {
                userId,
                type: "deposit",
                status: "completed",
                OR: [
                    { completedAt: { gte: startsAt, lte: upperBound } },
                    { completedAt: null, createdAt: { gte: startsAt, lte: upperBound } },
                ],
            },
            orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
            take: DETAIL_LIMIT,
            select: {
                id: true,
                amount: true,
                completedAt: true,
                createdAt: true,
                txHash: true,
                rawTx: true,
                confirmedEventAt: true,
                usdValueAtConfirmation: true,
                usdRateAtConfirmation: true,
            },
        }),
        prisma.transaction.findMany({
            where: depositPendingInWindowWhere(startsAt, upperBound, userId),
            orderBy: { createdAt: "desc" },
            take: DETAIL_LIMIT,
            select: {
                id: true,
                amount: true,
                createdAt: true,
                txHash: true,
                status: true,
            },
        }),
    ]);
    const deposits = [];
    for (const d of allCompleted) {
        if (!countsForDepositTournament(d.rawTx))
            continue;
        const at = eventTimeUtc(d);
        if (at >= startsAt && at <= upperBound)
            deposits.push(d);
    }
    const breakdown = await computeDepositScoreForUser(userId, startsAt, upperBound);
    let breakdownUsdTotal = 0;
    let breakdownUsdCount = 0;
    const depositRows = deposits.map((d) => {
        const amountPol = Number(d.amount);
        const usdValue = d.usdValueAtConfirmation != null ? Number(d.usdValueAtConfirmation) : null;
        const usdRate = d.usdRateAtConfirmation != null ? Number(d.usdRateAtConfirmation) : null;
        if (usdValue != null && Number.isFinite(usdValue)) {
            breakdownUsdTotal += usdValue;
            breakdownUsdCount += 1;
        }
        return {
            id: d.id,
            amountPol,
            amount: amountPol,
            usdValue,
            usdRate,
            completedAt: (d.confirmedEventAt ?? d.completedAt)?.toISOString() ?? null,
            createdAt: (d.createdAt ?? d.completedAt ?? new Date(0)).toISOString(),
            txHash: d.txHash ?? null,
            source: parseDepositSource(d.rawTx),
        };
    });
    return {
        rankingUnit: "pol_legacy",
        breakdown: {
            total: breakdown.total,
            txCount: breakdown.txCount,
            totalUsd: breakdownUsdCount > 0 ? breakdownUsdTotal : null,
        },
        deposits: depositRows,
        pendingInWindow: pendingInWindow.map((d) => ({
            id: d.id,
            amount: Number(d.amount),
            createdAt: d.createdAt.toISOString(),
            txHash: d.txHash,
            status: d.status,
        })),
    };
}
