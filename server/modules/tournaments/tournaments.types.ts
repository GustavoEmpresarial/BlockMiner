/**
 * Shared tournament domain types — used by engine, outbox, scorers, drift.
 */

export type TournamentMetric =
  | "HASHRATE"
  | "BLOCKS_MINED"
  | "CHECKINS"
  | "TASKS_COMPLETED"
  | "DEPOSITS_POL"
  | "DEPOSITS_USD"
  | "OFFERS_INTERNAL"
  | "OFFERS_EXTERNAL"
  | "OFFERS_ALL"
  | "MINIGAME_WINS"
  | "FAUCET"
  | "SHORTLINK"
  | "AUTO_MINING";

export type TournamentRecord = {
  id: number;
  name: string;
  metric: TournamentMetric | string;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type TournamentEngineStats = {
  participants: number;
  totalActions: number;
  leaderScore: number;
  lastContributionAt: string | null;
  lastReconcileAt: string | null;
  cacheVersion: number;
  lastDriftCheckAt: string | null;
  openDriftAlerts: number;
};

export type ContributionDelta = {
  userId: number;
  sourceType: string;
  sourceId: string;
  metricValue: number;
  eventAt: Date;
  metadata?: Record<string, unknown> | null;
};

export type ApplyContributionResult =
  | { applied: true; reason: "inserted" }
  | { applied: false; reason: "duplicate" };

export type TournamentActionPayload = {
  actionId: string;
  userId: number;
  provider: string;
  actionCount: number;
  executedAtUTC: string;
  sourceId: string;
  tournamentEligible: boolean;
  metadata?: Record<string, unknown> | null;
};

export type DepositConfirmedPayload = {
  userId: number;
  transactionId: number;
  polAmount: number;
  usdValue: number;
  usdRate?: number;
  txHash?: string | null;
  source?: string | null;
  eventAt: string;
  countsForTournament: boolean;
};

export type MiningBlockSettledPayload = {
  blockNumber: number;
  userIds: number[];
  eventAt: string;
};

export type ReconcileReport = {
  tournamentId: number;
  driftCount: number;
  corrected: number;
};

export type DriftDetail = {
  userId: number;
  expected: number;
  stored: number;
};

export type OfferwallDriftReport = {
  tournamentId: number;
  driftCount: number;
  details: DriftDetail[];
};

export function windowContains(
  window: { startsAt: Date; endsAt: Date },
  eventAt: Date,
  upperBound?: Date,
): boolean {
  const upper = upperBound && upperBound < window.endsAt ? upperBound : window.endsAt;
  return eventAt >= window.startsAt && eventAt <= upper;
}

export const TOURNAMENT_EVENT_ACTION_RECORDED = "tournament_action_recorded";
export const TOURNAMENT_EVENT_DEPOSIT_CONFIRMED = "deposit_confirmed";
export const TOURNAMENT_EVENT_BLOCK_MINED = "mining_block_settled";

export function tournamentActionIdempotencyKey(provider: string, sourceId: string): string {
  return `tournament_action:${provider}:${sourceId}`;
}

export function depositConfirmedIdempotencyKey(transactionId: number): string {
  return `deposit_confirmed:${transactionId}`;
}

export function miningBlockSettledIdempotencyKey(blockNumber: number): string {
  return `mining_block_settled:${blockNumber}`;
}

export function tournamentActionOutboxPayload(row: {
  id: bigint | number | string;
  userId: number;
  provider: string;
  actionCount: number;
  executedAtUTC: Date;
  sourceId: string;
  tournamentEligible: boolean;
  metadata?: unknown;
}): TournamentActionPayload {
  return {
    actionId: String(row.id),
    userId: row.userId,
    provider: row.provider,
    actionCount: row.actionCount,
    executedAtUTC: row.executedAtUTC.toISOString(),
    sourceId: row.sourceId,
    tournamentEligible: row.tournamentEligible,
    metadata:
      row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}
