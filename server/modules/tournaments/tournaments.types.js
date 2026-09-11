/**
 * Shared tournament domain types — used by engine, outbox, scorers, drift.
 */
export function windowContains(window, eventAt, upperBound) {
    const upper = upperBound && upperBound < window.endsAt ? upperBound : window.endsAt;
    return eventAt >= window.startsAt && eventAt <= upper;
}
export const TOURNAMENT_EVENT_ACTION_RECORDED = "tournament_action_recorded";
export const TOURNAMENT_EVENT_DEPOSIT_CONFIRMED = "deposit_confirmed";
export const TOURNAMENT_EVENT_BLOCK_MINED = "mining_block_settled";
export function tournamentActionIdempotencyKey(provider, sourceId) {
    return `tournament_action:${provider}:${sourceId}`;
}
export function depositConfirmedIdempotencyKey(transactionId) {
    return `deposit_confirmed:${transactionId}`;
}
export function miningBlockSettledIdempotencyKey(blockNumber) {
    return `mining_block_settled:${blockNumber}`;
}
export function tournamentActionOutboxPayload(row) {
    return {
        actionId: String(row.id),
        userId: row.userId,
        provider: row.provider,
        actionCount: row.actionCount,
        executedAtUTC: row.executedAtUTC.toISOString(),
        sourceId: row.sourceId,
        tournamentEligible: row.tournamentEligible,
        metadata: row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? row.metadata
            : null,
    };
}
