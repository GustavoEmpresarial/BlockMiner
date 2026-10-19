/**
 * Drains event_outbox. In-process cron on the app (same pattern as other crons).
 *
 * With Kafka (KAFKA_ENABLED / KAFKA_BROKERS): rows are published to their topic and the
 * stats-materializer process applies them. Without Kafka (the default since 2026-10-19): the
 * app applies the earnings events to user_stats_earnings_* itself, straight from the outbox.
 * The only consumer was the stats materializer, so a broker on a shared VM was costing ~1 GB
 * of RAM and a lot of CPU for ~3k events per block. applyEarningsEventsBatch is idempotent by
 * eventId (stats_event_dedupe), so a retried or partially failed batch never counts twice.
 */
import { logger } from "../../core/logger/index.js";
import {
  isKafkaEnabled,
  readEventOutboxBatchSize,
  readEventOutboxPublishCronMs,
} from "./events.config.js";
import { disconnectKafkaProducer, getConnectedProducer } from "./events.kafka.js";
import { listUnpublishedOutbox, markOutboxPublished } from "./events.outbox.js";
import { applyEarningsEventsBatch } from "./events.stats-materialize.js";

const log = logger.child("events.outbox-publisher");

/** Kafka-less path: apply the outbox rows to the stats tables, then mark them done. */
export async function materializeOutboxBatchOnce(): Promise<{ published: number; skipped: number }> {
  // 500 per tick, like the old materializer chunk: fewer round trips to the remote DB.
  const rows = await listUnpublishedOutbox(Math.max(readEventOutboxBatchSize(), 500));
  if (rows.length === 0) return { published: 0, skipped: 0 };
  const started = Date.now();
  const result = await applyEarningsEventsBatch(rows.map((r) => r.payloadJson));
  await markOutboxPublished(rows.map((r) => r.id));
  log.debug("events.outbox.materialized", { rows: rows.length, applied: result.applied, skipped: result.skipped, durationMs: Date.now() - started });
  return { published: rows.length, skipped: 0 };
}

export async function publishOutboxBatchOnce(): Promise<{ published: number; skipped: number }> {
  if (!isKafkaEnabled()) return materializeOutboxBatchOnce();
  const batchSize = readEventOutboxBatchSize();
  const rows = await listUnpublishedOutbox(batchSize);
  if (rows.length === 0) return { published: 0, skipped: 0 };

  const producer = await getConnectedProducer();
  if (!producer) return { published: 0, skipped: rows.length };

  const okIds: bigint[] = [];
  for (const row of rows) {
    try {
      await producer.send({
        topic: row.topic,
        messages: [
          {
            key: String((row.payloadJson as { userId?: number })?.userId ?? row.eventId),
            value: JSON.stringify(row.payloadJson),
            headers: { eventId: row.eventId },
          },
        ],
      });
      okIds.push(row.id);
    } catch (err) {
      log.error("Outbox publish failed", {
        eventId: row.eventId,
        topic: row.topic,
        error: err instanceof Error ? err.message : String(err),
      });
      break; // keep order; retry same head next tick
    }
  }

  if (okIds.length > 0) {
    await markOutboxPublished(okIds);
  }
  return { published: okIds.length, skipped: rows.length - okIds.length };
}

export function startEventOutboxPublisherCron(): { stop: () => void } {
  const intervalMs = readEventOutboxPublishCronMs();
  const run = () => {
    publishOutboxBatchOnce().catch((err) => {
      log.error("Outbox publisher tick failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };
  if (isKafkaEnabled()) {
    run();
  }
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("Event outbox publisher cron started", {
    intervalMs,
    kafkaEnabled: isKafkaEnabled(),
  });
  return {
    stop: () => {
      clearInterval(handle);
      void disconnectKafkaProducer();
    },
  };
}
