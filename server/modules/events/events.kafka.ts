/**
 * Shared KafkaJS client — producer for outbox publisher, consumer for stats materializer.
 */
import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";
import { logger } from "../../core/logger/index.js";
import { isKafkaEnabled, readKafkaBrokers, readKafkaClientId } from "./events.config.js";

const log = logger.child("events.kafka");

let kafkaSingleton: Kafka | null = null;
let producerSingleton: Producer | null = null;
let producerConnected = false;

export function getKafka(): Kafka | null {
  if (!isKafkaEnabled()) return null;
  if (!kafkaSingleton) {
    kafkaSingleton = new Kafka({
      clientId: readKafkaClientId(),
      brokers: readKafkaBrokers(),
      logLevel: logLevel.ERROR,
      retry: { retries: 8 },
    });
  }
  return kafkaSingleton;
}

export async function getConnectedProducer(): Promise<Producer | null> {
  const kafka = getKafka();
  if (!kafka) return null;
  if (!producerSingleton) {
    producerSingleton = kafka.producer();
  }
  if (!producerConnected) {
    await producerSingleton.connect();
    producerConnected = true;
    log.info("Kafka producer connected", { brokers: readKafkaBrokers() });
  }
  return producerSingleton;
}

export async function disconnectKafkaProducer(): Promise<void> {
  if (producerSingleton && producerConnected) {
    await producerSingleton.disconnect().catch(() => undefined);
    producerConnected = false;
  }
}

export async function createConnectedConsumer(groupId: string): Promise<Consumer | null> {
  const kafka = getKafka();
  if (!kafka) return null;
  const consumer = kafka.consumer({ groupId, allowAutoTopicCreation: true });
  await consumer.connect();
  log.info("Kafka consumer connected", { groupId, brokers: readKafkaBrokers() });
  return consumer;
}
