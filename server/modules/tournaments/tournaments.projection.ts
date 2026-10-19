import type { ContributionDelta, ApplyContributionResult } from "./tournaments.types.js";
import {
  applyScoreDelta,
  insertContributionIdempotent,
} from "./tournaments.repository.js";
import { dropCachedLeaderboard } from "./tournaments.cache.js";
import { queueContributionStats } from "./tournaments.metrics.js";
import { notifyTournamentDirty } from "./tournaments.realtime.js";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("ScoreProjection");

export async function applyContribution(
  tournamentId: number,
  delta: ContributionDelta,
): Promise<ApplyContributionResult> {
  const t0 = Date.now();
  let applied = false;
  try {
    log.debug("tournament.score.received", {
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
      log.debug("tournament.score.persisted", {
        tournamentId,
        userId: delta.userId,
        metricValue: delta.metricValue,
        persistedMs: Date.now() - t0,
      });
      return true;
    });
  } catch (err: unknown) {
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

  // The leaderboard cache is in-process; engine stats + cache version are batched per tournament.
  dropCachedLeaderboard(tournamentId);
  log.debug("tournament.cache.invalidated", { tournamentId });
  queueContributionStats(tournamentId, delta.userId, delta.metricValue, delta.eventAt);

  notifyTournamentDirty(tournamentId);
  log.debug("tournament.ranking.update_scheduled", { tournamentId, userId: delta.userId });

  // The one INFO line per contribution (the steps above are DEBUG): 6 lines each was ~330 MB/day.
  log.info("tournament.contribution.applied", {
    tournamentId,
    userId: delta.userId,
    sourceType: delta.sourceType,
    sourceId: delta.sourceId,
    metricValue: delta.metricValue,
    eventAt: delta.eventAt.toISOString(),
    totalMs: Date.now() - t0,
  });

  return { applied: true, reason: "inserted" };
}
