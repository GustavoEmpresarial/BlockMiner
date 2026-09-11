/**
 * Thin cron wrapper — drains event_outbox to Kafka.
 */
import { startEventOutboxPublisherCron } from "../modules/events/index.js";

export function startEventOutboxPublisherCronFromBootstrap() {
  return startEventOutboxPublisherCron();
}
