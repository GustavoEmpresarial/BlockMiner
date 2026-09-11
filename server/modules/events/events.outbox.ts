/**
 * Transactional outbox helpers — enqueue domain events in the same Prisma tx as the write.
 */
import type { Prisma } from "@prisma/client";
import type { TxClient } from "../../core/database/prisma.js";
import prisma from "../../core/database/prisma.js";
import { readKafkaTopicEarnings } from "./events.config.js";
import {
  buildEarningsPolCreditedEvent,
  type DomainEventEnvelope,
  type EarningsEventPayload,
  type EarningsSource,
} from "./events.envelope.js";

export type OutboxInsert = {
  eventId: string;
  topic: string;
  payloadJson: Prisma.InputJsonValue;
};

export { buildEarningsPolCreditedEvent };

export async function enqueueOutboxTx(tx: TxClient, row: OutboxInsert): Promise<void> {
  await tx.eventOutbox.create({
    data: {
      eventId: row.eventId,
      topic: row.topic,
      payloadJson: row.payloadJson,
    },
  });
}

export async function enqueueEarningsPolCreditedTx(
  tx: TxClient,
  input: {
    userId: number;
    source: EarningsSource;
    amountPol: number;
    occurredAt?: Date;
    eventId?: string;
    ref?: string;
  },
): Promise<DomainEventEnvelope<EarningsEventPayload> | null> {
  const amount = Number(input.amountPol);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!Number.isInteger(input.userId) || input.userId < 1) return null;

  const envelope = buildEarningsPolCreditedEvent(input);
  await enqueueOutboxTx(tx, {
    eventId: envelope.eventId,
    topic: readKafkaTopicEarnings(),
    payloadJson: envelope as unknown as Prisma.InputJsonValue,
  });
  return envelope;
}

/** Best-effort enqueue outside an existing tx (e.g. after commit). Never throws. */
export async function enqueueEarningsPolCreditedBestEffort(
  input: {
    userId: number;
    source: EarningsSource;
    amountPol: number;
    occurredAt?: Date;
    eventId?: string;
    ref?: string;
  },
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await enqueueEarningsPolCreditedTx(tx, input);
    });
  } catch {
    // Outbox is best-effort relative to the money path — never break the caller.
  }
}

export async function listUnpublishedOutbox(limit: number) {
  return prisma.eventOutbox.findMany({
    where: { publishedAt: null },
    orderBy: { id: "asc" },
    take: limit,
  });
}

export async function markOutboxPublished(ids: bigint[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.eventOutbox.updateMany({
    where: { id: { in: ids } },
    data: { publishedAt: new Date() },
  });
}
