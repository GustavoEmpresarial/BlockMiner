import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("TournamentEngineMetrics");
export async function bumpCacheVersion(tournamentId) {
    const row = await prisma.tournament.update({
        where: { id: tournamentId },
        data: { version: { increment: 1 } },
        select: { version: true },
    });
    return row.version;
}
export async function touchEngineStatsOnContribution(tournamentId, userId, actionCount, eventAt) {
    const [participantCount, leader, tournament] = await Promise.all([
        prisma.tournamentEntry.count({ where: { tournamentId, score: { gt: 0 } } }),
        prisma.tournamentEntry.findFirst({
            where: { tournamentId },
            orderBy: { score: "desc" },
            select: { score: true },
        }),
        prisma.tournament.findUnique({
            where: { id: tournamentId },
            select: { metricConfig: true, version: true },
        }),
    ]);
    const prev = tournament?.metricConfig?.engineStats ?? {};
    const totalActions = (prev.totalActions ?? 0) + actionCount;
    const engineStats = {
        participants: participantCount,
        totalActions,
        leaderScore: Number(leader?.score ?? 0),
        lastContributionAt: eventAt.toISOString(),
        lastReconcileAt: prev.lastReconcileAt ?? null,
        cacheVersion: tournament?.version ?? 0,
        lastDriftCheckAt: prev.lastDriftCheckAt ?? null,
        openDriftAlerts: prev.openDriftAlerts ?? 0,
    };
    await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
            metricConfig: {
                ...(tournament?.metricConfig ?? {}),
                engineStats,
            },
        },
    });
    log.info("tournament.engine_stats.updated", {
        tournamentId,
        userId,
        participants: engineStats.participants,
        totalActions: engineStats.totalActions,
        leaderScore: engineStats.leaderScore,
    });
}
export async function getEngineStats(tournamentId) {
    const row = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { metricConfig: true, version: true, scoresReconciledAt: true },
    });
    if (!row)
        return null;
    const cfg = row.metricConfig;
    if (cfg?.engineStats) {
        const s = cfg.engineStats;
        return {
            participants: s.participants ?? 0,
            totalActions: s.totalActions ?? 0,
            leaderScore: s.leaderScore ?? 0,
            lastContributionAt: s.lastContributionAt ?? null,
            lastReconcileAt: s.lastReconcileAt ?? null,
            cacheVersion: row.version,
            lastDriftCheckAt: s.lastDriftCheckAt ?? null,
            openDriftAlerts: s.openDriftAlerts ?? 0,
        };
    }
    return {
        participants: 0,
        totalActions: 0,
        leaderScore: 0,
        lastContributionAt: null,
        lastReconcileAt: row.scoresReconciledAt?.toISOString() ?? null,
        cacheVersion: row.version,
        lastDriftCheckAt: null,
        openDriftAlerts: 0,
    };
}
export function isOfferwallIncrementalMetric(metric) {
    return metric === "OFFERS_INTERNAL" || metric === "OFFERS_EXTERNAL" || metric === "OFFERS_ALL";
}
export function isMinigameIncrementalMetric(metric) {
    return metric === "MINIGAME_WINS";
}
export function isFaucetIncrementalMetric(metric) {
    return metric === "FAUCET";
}
export function isShortlinkIncrementalMetric(metric) {
    return metric === "SHORTLINK";
}
export function isAutoMiningIncrementalMetric(metric) {
    return metric === "AUTO_MINING";
}
export function isClaimCountIncrementalMetric(metric) {
    return (isFaucetIncrementalMetric(metric) ||
        isShortlinkIncrementalMetric(metric) ||
        isAutoMiningIncrementalMetric(metric));
}
export function tournamentUpperBound(tournament) {
    const now = new Date();
    return tournament.endsAt < now ? tournament.endsAt : now;
}
