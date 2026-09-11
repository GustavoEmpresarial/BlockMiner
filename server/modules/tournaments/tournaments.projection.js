import { applyScoreDelta, insertContributionIdempotent, } from "./tournaments.repository.js";
import { invalidateLeaderboardCache } from "./tournaments.cache.js";
import { touchEngineStatsOnContribution } from "./tournaments.metrics.js";
import { notifyTournamentDirty } from "./tournaments.realtime.js";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("ScoreProjection");
export async function applyContribution(tournamentId, delta) {
    const t0 = Date.now();
    let applied = false;
    try {
        log.info("tournament.score.received", {
            tournamentId,
            userId: delta.userId,
            sourceType: delta.sourceType,
            sourceId: delta.sourceId,
            metricValue: delta.metricValue,
        });
        applied = await prisma.$transaction(async (tx) => {
            const result = await insertContributionIdempotent(tournamentId, delta, tx);
            if (result === "duplicate") {
                log.info("tournament.contribution.duplicate", {
                    tournamentId,
                    userId: delta.userId,
                    sourceType: delta.sourceType,
                    sourceId: delta.sourceId,
                    metricValue: delta.metricValue,
                });
                return false;
            }
            await applyScoreDelta(tournamentId, delta.userId, delta.metricValue, delta.eventAt, tx);
            log.info("tournament.score.persisted", {
                tournamentId,
                userId: delta.userId,
                metricValue: delta.metricValue,
                persistedMs: Date.now() - t0,
            });
            return true;
        });
    }
    catch (err) {
        log.error("tournament.contribution.failed", {
            tournamentId,
            userId: delta.userId,
            sourceId: delta.sourceId,
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
    if (!applied) {
        return { applied: false, reason: "duplicate" };
    }
    log.info("tournament.contribution.applied", {
        tournamentId,
        userId: delta.userId,
        sourceType: delta.sourceType,
        sourceId: delta.sourceId,
        metricValue: delta.metricValue,
        eventAt: delta.eventAt.toISOString(),
    });
    await invalidateLeaderboardCache(tournamentId);
    log.info("tournament.cache.invalidated", { tournamentId });
    await touchEngineStatsOnContribution(tournamentId, delta.userId, delta.metricValue, delta.eventAt);
    notifyTournamentDirty(tournamentId);
    log.info("tournament.ranking.update_scheduled", {
        tournamentId,
        userId: delta.userId,
        totalMs: Date.now() - t0,
    });
    return { applied: true, reason: "inserted" };
}
