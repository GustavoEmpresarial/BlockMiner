/**
 * Apply earnings.pol_credited events into user_stats_earnings_* (idempotent by eventId).
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { isEarningsEventEnvelope, utcDayKey, } from "./events.envelope.js";
const log = logger.child("events.stats-materialize");
export async function applyEarningsEvent(raw) {
    if (!isEarningsEventEnvelope(raw)) {
        return { applied: false, reason: "invalid_envelope" };
    }
    const event = raw;
    if (event.type !== "earnings.pol_credited") {
        return { applied: false, reason: "ignored_type" };
    }
    const amount = Number(event.payload.amountPol);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { applied: false, reason: "non_positive_amount" };
    }
    const dayUtc = new Date(`${utcDayKey(event.occurredAt)}T00:00:00.000Z`);
    const amountDec = new Prisma.Decimal(String(amount));
    try {
        const applied = await prisma.$transaction(async (tx) => {
            const inserted = await tx.statsEventDedupe.createMany({
                data: [{ eventId: event.eventId }],
                skipDuplicates: true,
            });
            if (inserted.count === 0) {
                return false;
            }
            await tx.userStatsEarningsDaily.upsert({
                where: {
                    userId_dayUtc_source: {
                        userId: event.userId,
                        dayUtc,
                        source: event.payload.source,
                    },
                },
                create: {
                    userId: event.userId,
                    dayUtc,
                    source: event.payload.source,
                    amountPol: amountDec,
                },
                update: {
                    amountPol: { increment: amountDec },
                },
            });
            await tx.userStatsEarningsTotal.upsert({
                where: {
                    userId_source: {
                        userId: event.userId,
                        source: event.payload.source,
                    },
                },
                create: {
                    userId: event.userId,
                    source: event.payload.source,
                    amountPol: amountDec,
                },
                update: {
                    amountPol: { increment: amountDec },
                },
            });
            return true;
        });
        if (!applied) {
            return { applied: false, reason: "duplicate" };
        }
    }
    catch (err) {
        log.error("applyEarningsEvent failed", {
            eventId: event.eventId,
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
    return { applied: true };
}
