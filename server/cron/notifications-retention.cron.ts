/**
 * Notifications retention cron — ported from legacy/server/cron/notificationsRetentionCron.ts,
 * `setInterval`-based (same as mining.cron.ts / checkin.cron.ts).
 *
 * Bounds the `notifications` table, which in legacy had no retention at all and reached
 * 25M rows / 4.5GB — 76% of it older than 30 days. The only reader anywhere is the
 * notification bell (modules/notifications), which takes the most recent rows per user:
 * nothing aggregates this table and nothing reads it by date, so old rows are pure weight.
 *
 * Deletes in small batches on purpose. A single unbounded `deleteMany` over millions of rows
 * would open a huge transaction, generate an enormous WAL burst and hold locks for minutes.
 * Draining gradually keeps every statement short.
 */
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";

const log = logger.child("NotificationsRetentionCron");

/** Rows per DELETE. Small enough that each statement stays short under production load. */
const DEFAULT_BATCH = 5_000;
/** Batches per tick, so one tick cannot monopolise the database. */
const DEFAULT_BATCHES_PER_TICK = 10;
/** Breather between batches — lets normal traffic and autovacuum interleave. */
const PAUSE_BETWEEN_BATCHES_MS = 500;

export async function pruneOldNotifications(
  retentionDays: number,
  batchSize: number,
  maxBatches: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    // Select the ids first so the DELETE touches a bounded, index-driven set. Deleting straight
    // from a date predicate would let Postgres choose how many rows to lock.
    const doomed = await prisma.notification.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: batchSize,
    });
    if (doomed.length === 0) break;

    const res = await prisma.notification.deleteMany({
      where: { id: { in: doomed.map((n) => n.id) } },
    });
    deleted += res.count;

    if (doomed.length < batchSize) break; // caught up
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
  }

  return deleted;
}

/** Same problem, smaller table: tournament_score_drifts had no retention either in legacy. Small
 *  enough for a single deleteMany. */
export async function pruneOldTournamentScoreDrifts(driftRetentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - driftRetentionDays * 24 * 60 * 60 * 1000);
  const res = await prisma.tournamentScoreDrift.deleteMany({
    where: { detectedAt: { lt: cutoff } },
  });
  return res.count;
}

export function startNotificationsRetentionCron(): { stop: () => void } {
  const intervalMs = Math.max(60_000, Number(process.env.NOTIFICATIONS_RETENTION_CRON_MS) || 600_000);
  const retentionDays = Math.max(7, Number(process.env.NOTIFICATIONS_RETENTION_DAYS) || 30);
  const batchSize = Math.min(20_000, Math.max(100, Number(process.env.NOTIFICATIONS_RETENTION_BATCH) || DEFAULT_BATCH));
  const maxBatches = Math.max(1, Number(process.env.NOTIFICATIONS_RETENTION_BATCHES_PER_TICK) || DEFAULT_BATCHES_PER_TICK);
  const driftRetentionDays = Math.max(7, Number(process.env.DRIFT_RETENTION_DAYS) || 30);

  const run = async () => {
    try {
      const started = Date.now();
      const deleted = await pruneOldNotifications(retentionDays, batchSize, maxBatches);
      if (deleted > 0) {
        log.info("Notifications retention sweep", { deleted, retentionDays, durationMs: Date.now() - started });
      }
    } catch (err: unknown) {
      log.error("Notifications retention failed", { error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const deleted = await pruneOldTournamentScoreDrifts(driftRetentionDays);
      if (deleted > 0) {
        log.info("Tournament drift retention sweep", { deleted, driftRetentionDays });
      }
    } catch (err: unknown) {
      log.error("Tournament drift retention failed", { error: err instanceof Error ? err.message : String(err) });
    }
  };

  run();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Notifications retention cron started", { intervalMs, retentionDays, batchSize, maxBatches });
  return { stop: () => clearInterval(handle) };
}
