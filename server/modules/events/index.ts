/** Public surface of the events / Kafka module. */
export {
  isKafkaEnabled,
  readKafkaBrokers,
  readKafkaClientId,
  readKafkaTopicEarnings,
  readKafkaTopicPower,
  readKafkaStatsConsumerGroup,
  readEventOutboxPublishCronMs,
  readEventOutboxBatchSize,
  readStatsMaterializationMaxLagMs,
  KAFKA_TOPIC_EARNINGS_ENV_KEY,
  DEFAULT_KAFKA_TOPIC_EARNINGS,
  DEFAULT_KAFKA_TOPIC_POWER,
  DEFAULT_KAFKA_STATS_CONSUMER_GROUP,
  DEFAULT_EVENT_OUTBOX_PUBLISH_CRON_MS,
  DEFAULT_STATS_MATERIALIZATION_MAX_LAG_MS,
  STATS_MATERIALIZATION_MAX_LAG_MS_ENV_KEY,
  KAFKA_BROKERS_ENV_KEY,
} from "./events.config.js";
export {
  enqueueOutboxTx,
  enqueueEarningsPolCreditedTx,
  enqueueEarningsPolCreditedBestEffort,
  listUnpublishedOutbox,
  markOutboxPublished,
} from "./events.outbox.js";
export type { EarningsSource, DomainEventEnvelope, EarningsEventPayload } from "./events.envelope.js";
export {
  isEarningsEventEnvelope,
  utcDayKey,
  EARNINGS_EVENT_SCHEMA_VERSION,
  buildEarningsPolCreditedEvent,
} from "./events.envelope.js";
export { startEventOutboxPublisherCron, publishOutboxBatchOnce } from "./events.outbox-publisher.js";
export { applyEarningsEvent } from "./events.stats-materialize.js";
export {
  createConnectedConsumer,
  getConnectedProducer,
  disconnectKafkaProducer,
  getKafka,
} from "./events.kafka.js";
