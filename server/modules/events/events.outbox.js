import prisma from "../../core/database/prisma.js";
import { readKafkaTopicEarnings } from "./events.config.js";
import { buildEarningsPolCreditedEvent, } from "./events.envelope.js";
export { buildEarningsPolCreditedEvent };
export async function enqueueOutboxTx(tx, row) {
    await tx.eventOutbox.create({
        data: {
            eventId: row.eventId,
            topic: row.topic,
            payloadJson: row.payloadJson,
        },
    });
}
export async function enqueueEarningsPolCreditedTx(tx, input) {
    const amount = Number(input.amountPol);
    if (!Number.isFinite(amount) || amount <= 0)
        return null;
    if (!Number.isInteger(input.userId) || input.userId < 1)
        return null;
    const envelope = buildEarningsPolCreditedEvent(input);
    await enqueueOutboxTx(tx, {
        eventId: envelope.eventId,
        topic: readKafkaTopicEarnings(),
        payloadJson: envelope,
    });
    return envelope;
}
/** Best-effort enqueue outside an existing tx (e.g. after commit). Never throws. */
export async function enqueueEarningsPolCreditedBestEffort(input) {
    try {
        await prisma.$transaction(async (tx) => {
            await enqueueEarningsPolCreditedTx(tx, input);
        });
    }
    catch {
        // Outbox is best-effort relative to the money path — never break the caller.
    }
}
export async function listUnpublishedOutbox(limit) {
    return prisma.eventOutbox.findMany({
        where: { publishedAt: null },
        orderBy: { id: "asc" },
        take: limit,
    });
}
export async function markOutboxPublished(ids) {
    if (ids.length === 0)
        return;
    await prisma.eventOutbox.updateMany({
        where: { id: { in: ids } },
        data: { publishedAt: new Date() },
    });
}
