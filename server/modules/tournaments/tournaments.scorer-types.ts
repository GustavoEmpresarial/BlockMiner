import type {
  ContributionDelta,
  DepositConfirmedPayload,
  TournamentActionPayload,
  TournamentRecord,
} from "./tournaments.types.js";

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
