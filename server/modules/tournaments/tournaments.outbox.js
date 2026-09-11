import prisma from "../../core/database/prisma.js";
import { TOURNAMENT_EVENT_DEPOSIT_CONFIRMED, TOURNAMENT_EVENT_ACTION_RECORDED, TOURNAMENT_EVENT_BLOCK_MINED, } from "./tournaments.types.js";
import { handleDepositConfirmed, handleMiningBlockSettled, handleTournamentAction, } from "./tournaments.engine.js";
import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import { registerTournamentMetricScorers } from "./tournaments.scorers.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("TournamentOutbox");
const BATCH_SIZE = 50;
const MAX_RETRIES = 10;
const PROCESSING_LEASE_MS = 30 * 60 * 1000;
export function resolveTournamentOutboxDispatch(eventType) {
    if (eventType === TOURNAMENT_EVENT_DEPOSIT_CONFIRMED)
        return "deposit_confirmed";
    if (eventType === TOURNAMENT_EVENT_ACTION_RECORDED)
        return "action_recorded";
    if (eventType === TOURNAMENT_EVENT_BLOCK_MINED)
        return "block_mined";
    return null;
}
export function tournamentOutboxRetryDecision(retryCount, maxRetries = MAX_RETRIES) {
    return { status: "pending", exhausted: retryCount >= maxRetries };
}
export function isTournamentOutboxLeaseExpired(updatedAt, now, leaseMs = PROCESSING_LEASE_MS) {
    return now.getTime() - updatedAt.getTime() > leaseMs;
}
export async function processTournamentOutboxBatch() {
    registerTournamentMetricScorers();
    const now = new Date();
    const incrementalEnabled = isTournamentIncrementalScoringEnabled();
    await prisma.$executeRaw `
    UPDATE tournament_domain_outbox
       SET status = 'pending', updated_at = NOW(), next_run_at = NOW()
     WHERE status = 'processing'
       AND updated_at < NOW() - (${PROCESSING_LEASE_MS} * INTERVAL '1 millisecond')
  `;
    const pending = incrementalEnabled
        ? await prisma.$queryRaw `
        WITH candidates AS (
          SELECT id
            FROM tournament_domain_outbox
           WHERE status = 'pending' AND next_run_at <= ${now}
           ORDER BY id ASC
           LIMIT ${BATCH_SIZE}
           FOR UPDATE SKIP LOCKED
        )
        UPDATE tournament_domain_outbox AS outbox
           SET status = 'processing', updated_at = NOW()
          FROM candidates
         WHERE outbox.id = candidates.id
        RETURNING outbox.id,
                  outbox.event_type AS "eventType",
                  outbox.payload,
                  outbox.retry_count AS "retryCount",
                  outbox.idempotency_key AS "idempotencyKey"
      `
        : await prisma.$queryRaw `
        WITH candidates AS (
          SELECT id
            FROM tournament_domain_outbox
           WHERE status = 'pending'
             AND next_run_at <= ${now}
             AND event_type = ${TOURNAMENT_EVENT_BLOCK_MINED}
           ORDER BY id ASC
           LIMIT ${BATCH_SIZE}
           FOR UPDATE SKIP LOCKED
        )
        UPDATE tournament_domain_outbox AS outbox
           SET status = 'processing', updated_at = NOW()
          FROM candidates
         WHERE outbox.id = candidates.id
        RETURNING outbox.id,
                  outbox.event_type AS "eventType",
                  outbox.payload,
                  outbox.retry_count AS "retryCount",
                  outbox.idempotency_key AS "idempotencyKey"
      `;
    let processed = 0;
    for (const row of pending) {
        const leaseHeartbeat = setInterval(() => {
            void prisma.tournamentDomainOutbox
                .updateMany({
                where: { id: row.id, status: "processing" },
                data: { updatedAt: new Date() },
            })
                .catch(() => { });
        }, 60_000);
        try {
            const dispatch = resolveTournamentOutboxDispatch(row.eventType);
            if (dispatch === "deposit_confirmed") {
                await handleDepositConfirmed(row.payload);
            }
            else if (dispatch === "action_recorded") {
                await handleTournamentAction(row.payload);
            }
            else if (dispatch === "block_mined") {
                await handleMiningBlockSettled(row.payload);
            }
            await prisma.tournamentDomainOutbox.updateMany({
                where: { id: row.id, status: "processing" },
                data: { status: "completed", lastError: null },
            });
            log.info("tournament.outbox.processed", {
                outboxId: row.id,
                eventType: row.eventType,
                idempotencyKey: row.idempotencyKey,
            });
            processed++;
        }
        catch (err) {
            const retryCount = (row.retryCount ?? 0) + 1;
            const msg = err instanceof Error ? err.message : String(err);
            const status = tournamentOutboxRetryDecision(retryCount).status;
            const nextRunAt = new Date(Date.now() + Math.min(60_000, 1000 * 2 ** retryCount));
            await prisma.tournamentDomainOutbox.updateMany({
                where: { id: row.id, status: "processing" },
                data: { retryCount, lastError: msg, status, nextRunAt },
            });
            log.warn("tournament.outbox.failed", {
                outboxId: row.id,
                eventType: row.eventType,
                idempotencyKey: row.idempotencyKey,
                retryCount,
                status,
                error: msg,
            });
            if (retryCount >= MAX_RETRIES) {
                log.error("tournament.outbox.retry_exhausted_requeued", {
                    outboxId: row.id,
                    eventType: row.eventType,
                    retryCount,
                });
            }
        }
        finally {
            clearInterval(leaseHeartbeat);
        }
    }
    return processed;
}
