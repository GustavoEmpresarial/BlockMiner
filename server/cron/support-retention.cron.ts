/**
 * Support tickets retention — hard-delete stale logged-in + public (guest) tickets.
 *
 * Replies / public messages cascade via Prisma `onDelete: Cascade`. Batched like
 * notifications-retention so a large backlog does not lock the DB for minutes.
 */
import { logger } from "../core/logger/index.js";
import * as supportRepo from "../modules/support/support.repository.js";

const log = logger.child("SupportRetentionCron");

const DEFAULT_BATCH = 200;
const DEFAULT_BATCHES_PER_TICK = 10;
const PAUSE_BETWEEN_BATCHES_MS = 300;

export async function pruneOldSupportTickets(
  retentionDays: number,
  batchSize: number,
  maxBatches: number,
): Promise<{ support: number; publicSupport: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let support = 0;
  let publicSupport = 0;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const n = await supportRepo.deleteSupportMessagesOlderThan(cutoff, batchSize);
    support += n;
    if (n === 0) break;
    if (n < batchSize) break;
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
  }

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const n = await supportRepo.deletePublicSupportTicketsOlderThan(cutoff, batchSize);
    publicSupport += n;
    if (n === 0) break;
    if (n < batchSize) break;
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
  }

  return { support, publicSupport };
}

export function startSupportRetentionCron(): { stop: () => void } {
  const intervalMs = Math.max(60_000, Number(process.env.SUPPORT_RETENTION_CRON_MS) || 6 * 60 * 60 * 1000);
  const retentionDays = Math.max(14, Number(process.env.SUPPORT_RETENTION_DAYS) || 90);
  const batchSize = Math.min(2_000, Math.max(50, Number(process.env.SUPPORT_RETENTION_BATCH) || DEFAULT_BATCH));
  const maxBatches = Math.max(1, Number(process.env.SUPPORT_RETENTION_BATCHES_PER_TICK) || DEFAULT_BATCHES_PER_TICK);

  const run = async () => {
    try {
      const started = Date.now();
      const deleted = await pruneOldSupportTickets(retentionDays, batchSize, maxBatches);
      if (deleted.support > 0 || deleted.publicSupport > 0) {
        log.info("Support retention sweep", {
          ...deleted,
          retentionDays,
          durationMs: Date.now() - started,
        });
      }
    } catch (err: unknown) {
      log.error("Support retention failed", { error: err instanceof Error ? err.message : String(err) });
    }
  };

  run();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Support retention cron started", { intervalMs, retentionDays, batchSize, maxBatches });
  return { stop: () => clearInterval(handle) };
}
