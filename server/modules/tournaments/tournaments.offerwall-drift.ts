/**
 * Offerwall drift detection — compares source-of-truth scores (Zerads / offerwall.me /
 * internal attempts) against live TournamentEntry ranks so reconcile can autocorrect.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import type { DriftDetail, OfferwallDriftReport, TournamentRecord } from "./tournaments.types.js";
import { computeOfferwallScores } from "./tournaments.scoring-config.js";
import { getEntryScores, touchScoresReconciledAt } from "./tournaments.repository.js";

const log = logger.child("OfferwallDrift");
const INTEGER_TOLERANCE = 0;

function tournamentUpperBound(tournament: TournamentRecord): Date {
  const now = new Date();
  return tournament.endsAt < now ? tournament.endsAt : now;
}

function sumMap(map: Map<number, number>): number {
  let t = 0;
  for (const v of map.values()) t += v;
  return t;
}

async function sumContributionsByUser(tournamentId: number): Promise<Map<number, number>> {
  const rows = await prisma.tournamentScoreContribution.groupBy({
    by: ["userId"],
    where: { tournamentId },
    _sum: { metricValue: true },
  });
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.userId, Number(r._sum.metricValue ?? 0));
  }
  return map;
}

/**
 * Expected offerwall score per user from source tables (Zerads clicks, offerwall.me, internal).
 * This is what ranks should match — not only TournamentAction rows (which are empty when V2 was off).
 */
async function expectedScoresFromSources(
  tournament: TournamentRecord,
): Promise<Map<number, number>> {
  const metric = tournament.metric;
  if (metric !== "OFFERS_INTERNAL" && metric !== "OFFERS_EXTERNAL" && metric !== "OFFERS_ALL") {
    return new Map();
  }
  const upper = tournamentUpperBound(tournament);
  const breakdown = await computeOfferwallScores(tournament.startsAt, upper, { metric });
  const map = new Map<number, number>();
  for (const [userId, b] of breakdown) {
    if (b.total > 0) map.set(userId, b.total);
  }
  return map;
}

/**
 * Triple check: source totals vs contributions vs entry.score.
 * Autocorrect uses `actionTotals` (= source totals) as the ranking repair payload.
 */
export async function detectOfferwallDrift(
  tournament: TournamentRecord,
): Promise<OfferwallDriftReport> {
  const [sourceTotals, contributions, entries] = await Promise.all([
    expectedScoresFromSources(tournament),
    sumContributionsByUser(tournament.id),
    getEntryScores(tournament.id),
  ]);

  const allUserIds = new Set([
    ...sourceTotals.keys(),
    ...contributions.keys(),
    ...entries.keys(),
  ]);

  const drifts: DriftDetail[] = [];

  for (const userId of allUserIds) {
    const actionTotal = sourceTotals.get(userId) ?? 0;
    const contributionTotal = contributions.get(userId) ?? 0;
    const entryScore = entries.get(userId) ?? 0;
    const deltaAC = actionTotal - contributionTotal;
    const deltaCE = contributionTotal - entryScore;

    if (Math.abs(actionTotal - entryScore) > INTEGER_TOLERANCE) {
      drifts.push({
        userId,
        actionTotal,
        contributionTotal,
        entryScore,
        deltaActionsContributions: deltaAC,
        deltaContributionsEntry: deltaCE,
      });
    }
  }

  const checkedAt = new Date().toISOString();
  const report: OfferwallDriftReport = {
    tournamentId: tournament.id,
    metric: tournament.metric,
    driftCount: drifts.length,
    drifts,
    checkedAt,
    actionTotals: Array.from(sourceTotals.entries()).map(([userId, score]) => ({ userId, score })),
    totals: {
      actions: sumMap(sourceTotals),
      contributions: sumMap(contributions),
      entries: sumMap(entries),
    },
  };

  if (drifts.length > 0) {
    log.warn("tournament.offerwall.drift", {
      tournamentId: tournament.id,
      metric: tournament.metric,
      driftCount: drifts.length,
      totals: report.totals,
    });
  } else {
    log.info("tournament.offerwall.reconcile.ok", {
      tournamentId: tournament.id,
      metric: tournament.metric,
      totals: report.totals,
    });
  }

  await touchScoresReconciledAt(tournament.id);
  return report;
}

export async function listRecentDriftAlerts(tournamentId: number, limit = 50) {
  try {
    return await prisma.tournamentScoreDrift.findMany({
      where: { tournamentId },
      orderBy: { detectedAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}
