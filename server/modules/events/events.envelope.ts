/**
 * Domain event envelope for Kafka topics (stats first consumer: bm.earnings.v1).
 */
import crypto from "node:crypto";

export const EARNINGS_EVENT_SCHEMA_VERSION = 1 as const;

export type EarningsSource =
  | "mining"
  | "checkin"
  | "faucet"
  | "shortlinks"
  | "youtube"
  | "games"
  | "autoMining"
  | "offerwallInternal"
  | "offerwallExternal"
  | "referrals";

export type EarningsEventType = "earnings.pol_credited";

export type EarningsEventPayload = {
  source: EarningsSource;
  amountPol: number;
  /** Optional correlation (block number, inbox id, etc.). */
  ref?: string;
};

export type DomainEventEnvelope<TPayload = EarningsEventPayload> = {
  eventId: string;
  type: EarningsEventType | string;
  userId: number;
  occurredAt: string;
  schemaVersion: number;
  payload: TPayload;
};

export function isEarningsEventEnvelope(
  value: unknown,
): value is DomainEventEnvelope<EarningsEventPayload> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.eventId !== "string" || !v.eventId) return false;
  if (typeof v.type !== "string" || !v.type) return false;
  if (!Number.isInteger(v.userId) || (v.userId as number) < 1) return false;
  if (typeof v.occurredAt !== "string") return false;
  if (!Number.isInteger(v.schemaVersion)) return false;
  const p = v.payload;
  if (!p || typeof p !== "object") return false;
  const payload = p as Record<string, unknown>;
  if (typeof payload.source !== "string") return false;
  if (typeof payload.amountPol !== "number" || !Number.isFinite(payload.amountPol)) return false;
  return true;
}

export function utcDayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(d.getTime())) return new Date(0).toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function buildEarningsPolCreditedEvent(input: {
  userId: number;
  source: EarningsSource;
  amountPol: number;
  occurredAt?: Date;
  eventId?: string;
  ref?: string;
}): DomainEventEnvelope<EarningsEventPayload> {
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
