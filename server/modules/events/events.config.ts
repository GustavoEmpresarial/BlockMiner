/**
 * Kafka / domain-event config — named env keys, no magic strings at call sites.
 */

export const KAFKA_BROKERS_ENV_KEY = "KAFKA_BROKERS";
export const DEFAULT_KAFKA_BROKERS = "127.0.0.1:9092";

export const KAFKA_CLIENT_ID_ENV_KEY = "KAFKA_CLIENT_ID";
export const DEFAULT_KAFKA_CLIENT_ID = "blockminer-app";

export const KAFKA_TOPIC_EARNINGS_ENV_KEY = "KAFKA_TOPIC_EARNINGS";
export const DEFAULT_KAFKA_TOPIC_EARNINGS = "bm.earnings.v1";

export const KAFKA_TOPIC_POWER_ENV_KEY = "KAFKA_TOPIC_POWER";
export const DEFAULT_KAFKA_TOPIC_POWER = "bm.power.v1";

export const KAFKA_STATS_CONSUMER_GROUP_ENV_KEY = "KAFKA_STATS_CONSUMER_GROUP";
export const DEFAULT_KAFKA_STATS_CONSUMER_GROUP = "stats-earnings-v1";

export const EVENT_OUTBOX_PUBLISH_CRON_MS_ENV_KEY = "EVENT_OUTBOX_PUBLISH_CRON_MS";
export const DEFAULT_EVENT_OUTBOX_PUBLISH_CRON_MS = 2_000;

export const EVENT_OUTBOX_BATCH_SIZE_ENV_KEY = "EVENT_OUTBOX_BATCH_SIZE";
export const DEFAULT_EVENT_OUTBOX_BATCH_SIZE = 100;

export const STATS_MATERIALIZATION_MAX_LAG_MS_ENV_KEY = "STATS_MATERIALIZATION_MAX_LAG_MS";
/** If newest materialization row is older than this, API falls back to live aggregates. */
export const DEFAULT_STATS_MATERIALIZATION_MAX_LAG_MS = 120_000;

export const KAFKA_ENABLED_ENV_KEY = "KAFKA_ENABLED";

export function isKafkaEnabled(
  raw: string | undefined | null = process.env[KAFKA_ENABLED_ENV_KEY],
): boolean {
  if (raw == null || String(raw).trim() === "") {
    return Boolean(process.env[KAFKA_BROKERS_ENV_KEY]?.trim());
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function readKafkaBrokers(
  raw: string | undefined | null = process.env[KAFKA_BROKERS_ENV_KEY],
): string[] {
  const csv = raw == null || String(raw).trim() === "" ? DEFAULT_KAFKA_BROKERS : String(raw).trim();
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readKafkaClientId(
  raw: string | undefined | null = process.env[KAFKA_CLIENT_ID_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_KAFKA_CLIENT_ID;
  return String(raw).trim();
}

export function readKafkaTopicEarnings(
  raw: string | undefined | null = process.env[KAFKA_TOPIC_EARNINGS_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_KAFKA_TOPIC_EARNINGS;
  return String(raw).trim();
}

export function readKafkaTopicPower(
  raw: string | undefined | null = process.env[KAFKA_TOPIC_POWER_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_KAFKA_TOPIC_POWER;
  return String(raw).trim();
}

export function readKafkaStatsConsumerGroup(
  raw: string | undefined | null = process.env[KAFKA_STATS_CONSUMER_GROUP_ENV_KEY],
): string {
  if (raw == null || String(raw).trim() === "") return DEFAULT_KAFKA_STATS_CONSUMER_GROUP;
  return String(raw).trim();
}

export function readEventOutboxPublishCronMs(
  raw: string | undefined | null = process.env[EVENT_OUTBOX_PUBLISH_CRON_MS_ENV_KEY],
): number {
  const n = Number(raw ?? DEFAULT_EVENT_OUTBOX_PUBLISH_CRON_MS);
  return Number.isFinite(n) && n >= 500 ? Math.floor(n) : DEFAULT_EVENT_OUTBOX_PUBLISH_CRON_MS;
}

export function readEventOutboxBatchSize(
  raw: string | undefined | null = process.env[EVENT_OUTBOX_BATCH_SIZE_ENV_KEY],
): number {
  const n = Number(raw ?? DEFAULT_EVENT_OUTBOX_BATCH_SIZE);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_EVENT_OUTBOX_BATCH_SIZE;
}

export function readStatsMaterializationMaxLagMs(
  raw: string | undefined | null = process.env[STATS_MATERIALIZATION_MAX_LAG_MS_ENV_KEY],
): number {
  const n = Number(raw ?? DEFAULT_STATS_MATERIALIZATION_MAX_LAG_MS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_STATS_MATERIALIZATION_MAX_LAG_MS;
}
