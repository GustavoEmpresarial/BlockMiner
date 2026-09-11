/**
 * Metric scorers for incremental + reconcile tournament scoring.
 */
import prisma from "../../core/database/prisma.js";
import { windowContains, type TournamentRecord } from "./tournaments.types.js";
import {
  contributionSourceId,
  providerAllowedForMetric,
} from "./tournaments.providers.js";
import { createClaimCountScorers } from "./tournaments.claim-scorers.js";
import {
  aggregateDepositSummary,
  computeDepositScores,
  computeDepositUsdScores,
  getDepositScoreDetailForUser,
} from "./deposit-score.js";
import type { ContributionDelta, TournamentActionPayload, DepositConfirmedPayload } from "./tournaments.types.js";

export { ClaimCountMetricScorer, createClaimCountScorers } from "./tournaments.claim-scorers.js";

export type MetricScoreBreakdown = { total: number; txCount: number };

export type MetricScorer = {
  metric: string;
  onTournamentAction?: (
    event: TournamentActionPayload,
    tournament: TournamentRecord,
  ) => ContributionDelta | null;
  onDepositConfirmed?: (
    event: DepositConfirmedPayload,
    tournament: TournamentRecord,
  ) => ContributionDelta | null;
  reconcile: (
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
    opts?: { userId?: number },
  ) => Promise<Map<number, MetricScoreBreakdown>>;
  getUserBreakdown?: (
    userId: number,
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
  ) => Promise<unknown>;
  getAggregateSummary?: (
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
  ) => Promise<unknown>;
};

const scorers = new Map<string, MetricScorer>();

export function registerMetricScorer(scorer: MetricScorer): void {
  scorers.set(scorer.metric, scorer);
}

export function getMetricScorer(metric: string): MetricScorer | undefined {
  return scorers.get(metric);
}

export function getAllMetricScorers(): MetricScorer[] {
  return Array.from(scorers.values());
}

export function clearMetricScorersForTests(): void {
  scorers.clear();
}

function upperBound(tournament: TournamentRecord): Date {
  const now = new Date();
  return tournament.endsAt < now ? tournament.endsAt : now;
}

export class OffersMetricScorer implements MetricScorer {
  constructor(public readonly metric: "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL") {}

  onTournamentAction(event: TournamentActionPayload, tournament: TournamentRecord): ContributionDelta | null {
    if (!event.tournamentEligible || event.actionCount <= 0) return null;
    if (tournament.metric !== this.metric) return null;
    if (!providerAllowedForMetric(event.provider, this.metric)) return null;
    const eventAt = new Date(event.executedAtUTC);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;
    return {
      userId: event.userId,
      sourceType: "action",
      sourceId: contributionSourceId(event.provider, event.sourceId),
      metricValue: event.actionCount,
      eventAt,
      metadata: { provider: event.provider, actionId: event.actionId },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
    opts?: { userId?: number },
  ): Promise<Map<number, MetricScoreBreakdown>> {
    const { computeOfferwallScores } = await import("./tournaments.scoring-config.js");
    const upper = upperBound(tournament);
    const endAt = window.endsAt < upper ? window.endsAt : upper;
    const scores = await computeOfferwallScores(window.startsAt, endAt, {
      metric: this.metric,
      userId: opts?.userId,
    });
    const map = new Map<number, MetricScoreBreakdown>();
    for (const [userId, b] of scores) {
      if (b.total <= 0) continue;
      map.set(userId, { total: b.total, txCount: b.total });
    }
    return map;
  }
}

export function createOffersScorers(): MetricScorer[] {
  return [
    new OffersMetricScorer("OFFERS_INTERNAL"),
    new OffersMetricScorer("OFFERS_EXTERNAL"),
    new OffersMetricScorer("OFFERS_ALL"),
  ];
}

export class DepositUsdScorer implements MetricScorer {
  metric = "DEPOSITS_USD" as const;

  onDepositConfirmed(event: DepositConfirmedPayload, tournament: TournamentRecord): ContributionDelta | null {
    if (!event.countsForTournament) return null;
    const eventAt = new Date(event.eventAt);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;
    if (event.usdValue <= 0) return null;
    return {
      userId: event.userId,
      sourceType: "deposit",
      sourceId: String(event.transactionId),
      metricValue: event.usdValue,
      eventAt,
      metadata: {
        polAmount: event.polAmount,
        usdRate: event.usdRate,
        txHash: event.txHash,
        source: event.source,
      },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
  ): Promise<Map<number, MetricScoreBreakdown>> {
    const ub = upperBound(tournament);
    return computeDepositUsdScores(window.startsAt, ub);
  }

  async getUserBreakdown(
    userId: number,
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
  ) {
    const ub = upperBound(tournament);
    const detail = await getDepositScoreDetailForUser(userId, window.startsAt, ub);
    const totalUsd =
      detail.breakdown.totalUsd != null && Number.isFinite(detail.breakdown.totalUsd)
        ? Number(detail.breakdown.totalUsd)
        : 0;
    return {
      ...detail,
      rankingUnit: "usd" as const,
      breakdown: {
        total: totalUsd,
        txCount: detail.breakdown.txCount,
        totalUsd: detail.breakdown.totalUsd,
        totalPol: detail.breakdown.total,
      },
    };
  }

  async getAggregateSummary(tournament: TournamentRecord, window: { startsAt: Date; endsAt: Date }) {
    const ub = upperBound(tournament);
    const summary = await aggregateDepositSummary(window.startsAt, ub);
    return {
      ...summary,
      rankingUnit: "usd" as const,
    };
  }
}

export class DepositPolScorer implements MetricScorer {
  metric = "DEPOSITS_POL" as const;

  onDepositConfirmed(event: DepositConfirmedPayload, tournament: TournamentRecord): ContributionDelta | null {
    if (!event.countsForTournament) return null;
    const eventAt = new Date(event.eventAt);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;
    if (event.polAmount <= 0) return null;
    return {
      userId: event.userId,
      sourceType: "deposit",
      sourceId: String(event.transactionId),
      metricValue: event.polAmount,
      eventAt,
      metadata: { txHash: event.txHash, source: event.source },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
  ): Promise<Map<number, MetricScoreBreakdown>> {
    const ub = upperBound(tournament);
    return computeDepositScores(window.startsAt, ub);
  }

  async getUserBreakdown(
    userId: number,
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
  ) {
    const ub = upperBound(tournament);
    return getDepositScoreDetailForUser(userId, window.startsAt, ub);
  }

  async getAggregateSummary(tournament: TournamentRecord, window: { startsAt: Date; endsAt: Date }) {
    const ub = upperBound(tournament);
    return aggregateDepositSummary(window.startsAt, ub);
  }
}

export class MinigameWinsScorer implements MetricScorer {
  metric = "MINIGAME_WINS" as const;

  onTournamentAction(event: TournamentActionPayload, tournament: TournamentRecord): ContributionDelta | null {
    if (!event.tournamentEligible || event.actionCount <= 0) return null;
    if (tournament.metric !== this.metric) return null;
    if (!providerAllowedForMetric(event.provider, this.metric)) return null;
    const eventAt = new Date(event.executedAtUTC);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;
    return {
      userId: event.userId,
      sourceType: "action",
      sourceId: contributionSourceId(event.provider, event.sourceId),
      metricValue: event.actionCount,
      eventAt,
      metadata: { provider: event.provider, actionId: event.actionId },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    window: { startsAt: Date; endsAt: Date },
    opts?: { userId?: number },
  ): Promise<Map<number, MetricScoreBreakdown>> {
    const upper = upperBound(tournament);
    const endAt = window.endsAt < upper ? window.endsAt : upper;
    const rows = await prisma.gameSessionLog.groupBy({
      by: ["userId"],
      where: {
        success: true,
        rewardGranted: true,
        createdAt: { gte: window.startsAt, lte: endAt },
        ...(opts?.userId != null ? { userId: opts.userId } : {}),
      },
      _count: { id: true },
    });
    const map = new Map<number, MetricScoreBreakdown>();
    for (const r of rows) {
      const total = Number(r._count.id ?? 0);
      if (total <= 0) continue;
      map.set(r.userId, { total, txCount: total });
    }
    return map;
  }
}

export function createMinigameScorers(): MetricScorer[] {
  return [new MinigameWinsScorer()];
}

let registered = false;

export function registerTournamentMetricScorers(): void {
  if (registered) return;
  registerMetricScorer(new DepositUsdScorer());
  registerMetricScorer(new DepositPolScorer());
  for (const scorer of createOffersScorers()) registerMetricScorer(scorer);
  for (const scorer of createMinigameScorers()) registerMetricScorer(scorer);
  for (const scorer of createClaimCountScorers()) registerMetricScorer(scorer);
  registered = true;
}

/** Test helper — reset registration gate. */
export function resetScorerRegistrationForTests(): void {
  registered = false;
  clearMetricScorersForTests();
}
