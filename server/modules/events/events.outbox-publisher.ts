/**
 * Drains event_outbox → Kafka. In-process cron on the app (same pattern as other crons).
 */
import { logger } from "../../core/logger/index.js";
import {
  isKafkaEnabled,
  readEventOutboxBatchSize,
  readEventOutboxPublishCronMs,
} from "./events.config.js";
import { disconnectKafkaProducer, getConnectedProducer } from "./events.kafka.js";
import { listUnpublishedOutbox, markOutboxPublished } from "./events.outbox.js";

const log = logger.child("events.outbox-publisher");

export async function publishOutboxBatchOnce(): Promise<{ published: number; skipped: number }> {
  if (!isKafkaEnabled()) return { published: 0, skipped: 0 };
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
