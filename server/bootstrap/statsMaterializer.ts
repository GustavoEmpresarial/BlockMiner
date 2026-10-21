/**
 * Stats materializer process — consumes bm.earnings.v1 and upserts user_stats_earnings_*.
 * Compose service `stats-materializer` / K8s Deployment with ROLE=stats-materializer.
 */
import "dotenv/config";
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";
import { reportError } from "../core/errors/index.js";
import {
  applyEarningsEventsBatch,
  createConnectedConsumer,
  isKafkaEnabled,
  readKafkaStatsConsumerGroup,
  readKafkaTopicEarnings,
} from "../modules/events/index.js";

const log = logger.child("StatsMaterializer");

/** Events per DB transaction — big enough to amortize the cross-VM round trips, small enough to keep each commit short. */
const BATCH_CHUNK = 500;

async function main(): Promise<void> {
  if (!isKafkaEnabled()) {
    log.error("KAFKA_ENABLED/KAFKA_BROKERS not configured — materializer exiting");
    process.exit(1);
  }

  const topic = readKafkaTopicEarnings();
  const groupId = readKafkaStatsConsumerGroup();
  const consumer = await createConnectedConsumer(groupId);
  if (!consumer) {
    log.error("Failed to create Kafka consumer");
    process.exit(1);
  }

  await consumer.subscribe({ topic, fromBeginning: false });
  log.info("Stats materializer subscribed", { topic, groupId });

  await consumer.run({
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, isRunning, isStale }) => {
      for (let i = 0; i < batch.messages.length; i += BATCH_CHUNK) {
        if (!isRunning() || isStale()) return;
        const chunk = batch.messages.slice(i, i + BATCH_CHUNK);
        const parsed: unknown[] = [];
        let invalidJson = 0;
        for (const message of chunk) {
          const raw = message.value?.toString("utf8");
          if (!raw) continue;
          try {
            parsed.push(JSON.parse(raw));
          } catch {
            invalidJson += 1;
          }
        }
        const started = Date.now();
        try {
          const result = await applyEarningsEventsBatch(parsed);
          log.info("Earnings batch applied", {
            partition: batch.partition,
            lastOffset: chunk[chunk.length - 1].offset,
            applied: result.applied,
            skipped: result.skipped,
            invalidJson,
            durationMs: Date.now() - started,
          });
        } catch (err) {
          // Throwing makes kafkajs retry from the last resolved offset; the dedupe table keeps
          // the replay idempotent, so a partially failed batch is never counted twice.
          reportError({
            code: "STATS_MATERIALIZE_BATCH_FAILED",
            category: "DATABASE",
            severity: "ERROR",
            impact: "MEDIUM",
            module: "events.stats-materializer",
            operation: "eachBatch",
            error: err,
            context: { partition: batch.partition, firstOffset: chunk[0].offset, size: chunk.length },
          });
          throw err;
        }
        resolveOffset(chunk[chunk.length - 1].offset);
        await heartbeat();
        await commitOffsetsIfNecessary();
      }
    },
  });

  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}, shutting down materializer`);
    await consumer.disconnect().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main().catch((err) => {
  log.error("Materializer fatal", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
