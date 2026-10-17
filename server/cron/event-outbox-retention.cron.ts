/**
 * Event outbox retention cron. `event_outbox` had no retention at all: every earnings event
 * stayed forever after the publisher shipped it to Kafka — 18M rows / 10 GB by 2026-10-17,
 * with ~2,000 more per mining block, each one also updating four indexes.
 *
 * Only rows already PUBLISHED and older than EVENT_OUTBOX_RETENTION_DAYS (default 7, min 3) go.
 * Unpublished rows are never touched. Losing an old row's unique eventId is safe: a replayed
 * settlement that old does not happen, and the stats materializer keeps its own idempotency
 * table (stats_event_dedupe), so a re-enqueued event would still be counted once.
 *
 * Same draining discipline as notifications-retention.cron.ts: bounded id batches, a pause
 * between them, a cap per tick — no long transaction, no WAL burst, no long lock.
 */
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";

const log = logger.child("EventOutboxRetentionCron");

const DEFAULT_BATCH = 5_000;
const DEFAULT_BATCHES_PER_TICK = 30;
const PAUSE_BETWEEN_BATCHES_MS = 500;

export async function pruneOldPublishedOutbox(
  retentionDays: number,
  batchSize: number,
  maxBatches: number,
  pauseMs = PAUSE_BETWEEN_BATCHES_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // (published_at, id) index: picks the oldest published rows without scanning the table.
    const doomed = await prisma.eventOutbox.findMany({
      where: { publishedAt: { not: null, lt: cutoff } },
      select: { id: true },
      orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      take: batchSize,
    });
    if (doomed.length === 0) break;
    const res = await prisma.eventOutbox.deleteMany({
      where: { id: { in: doomed.map((r) => r.id) }, publishedAt: { not: null, lt: cutoff } },
    });
    deleted += res.count;
    if (doomed.length < batchSize) break;
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  return deleted;
}

export function startEventOutboxRetentionCron(): { stop: () => void } {
  if (process.env.EVENT_OUTBOX_RETENTION_ENABLED === "0") {
    log.info("Event outbox retention disabled via EVENT_OUTBOX_RETENTION_ENABLED=0");
    return { stop: () => {} };
  }
  const intervalMs = Math.max(60_000, Number(process.env.EVENT_OUTBOX_RETENTION_CRON_MS) || 600_000);
  const retentionDays = Math.max(3, Number(process.env.EVENT_OUTBOX_RETENTION_DAYS) || 7);
  const batchSize = Math.min(20_000, Math.max(100, Number(process.env.EVENT_OUTBOX_RETENTION_BATCH) || DEFAULT_BATCH));
  const maxBatches = Math.max(1, Number(process.env.EVENT_OUTBOX_RETENTION_BATCHES_PER_TICK) || DEFAULT_BATCHES_PER_TICK);

  let running = false;
  const run = async () => {
    if (running) return; // a slow tick must not overlap the next one
    running = true;
    try {
      const started = Date.now();
      const deleted = await pruneOldPublishedOutbox(retentionDays, batchSize, maxBatches);
      if (deleted > 0) {
        log.info("Event outbox retention sweep", { deleted, retentionDays, durationMs: Date.now() - started });
      }
    } catch (err: unknown) {
      log.error("Event outbox retention failed", {
        code: "EVENT_OUTBOX_RETENTION_FAILED",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };

  // First sweep a little after boot, not during the boot sync.
  const first = setTimeout(run, 120_000);
  first.unref?.();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Event outbox retention cron started", { intervalMs, retentionDays, batchSize, maxBatches });
  return {
    stop: () => {
      clearTimeout(first);
      clearInterval(handle);
    },
  };
}
