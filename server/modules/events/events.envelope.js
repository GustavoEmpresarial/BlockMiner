/**
 * Domain event envelope for Kafka topics (stats first consumer: bm.earnings.v1).
 */
import crypto from "node:crypto";
export const EARNINGS_EVENT_SCHEMA_VERSION = 1;
export function isEarningsEventEnvelope(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    if (typeof v.eventId !== "string" || !v.eventId)
        return false;
    if (typeof v.type !== "string" || !v.type)
        return false;
    if (!Number.isInteger(v.userId) || v.userId < 1)
        return false;
    if (typeof v.occurredAt !== "string")
        return false;
    if (!Number.isInteger(v.schemaVersion))
        return false;
    const p = v.payload;
    if (!p || typeof p !== "object")
        return false;
    const payload = p;
    if (typeof payload.source !== "string")
        return false;
    if (typeof payload.amountPol !== "number" || !Number.isFinite(payload.amountPol))
        return false;
    return true;
}
export function utcDayKey(isoOrDate) {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (!Number.isFinite(d.getTime()))
        return new Date(0).toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
}
export function buildEarningsPolCreditedEvent(input) {
    const occurredAt = input.occurredAt ?? new Date();
    const amountPol = Number(input.amountPol);
    return {
        eventId: input.eventId ?? crypto.randomUUID(),
        type: "earnings.pol_credited",
        userId: input.userId,
        occurredAt: occurredAt.toISOString(),
        schemaVersion: EARNINGS_EVENT_SCHEMA_VERSION,
        payload: {
            source: input.source,
            amountPol,
            ...(input.ref ? { ref: input.ref } : {}),
        },
    };
}
