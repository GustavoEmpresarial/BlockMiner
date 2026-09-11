/**
 * Stats materializer process — consumes bm.earnings.v1 and upserts user_stats_earnings_*.
 * Compose service `stats-materializer` / K8s Deployment with ROLE=stats-materializer.
 */
import "dotenv/config";
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";
import {
  applyEarningsEvent,
  createConnectedConsumer,
  isKafkaEnabled,
  readKafkaStatsConsumerGroup,
  readKafkaTopicEarnings,
} from "../modules/events/index.js";

const log = logger.child("StatsMaterializer");

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
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString("utf8");
      if (!raw) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        log.warn("Invalid JSON message skipped");
        return;
      }
      const result = await applyEarningsEvent(parsed);
      if (result.applied) {
        log.info("Earnings event applied", {
          eventId: (parsed as { eventId?: string }).eventId,
        });
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
