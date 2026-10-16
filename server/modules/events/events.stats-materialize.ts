/**
 * Apply earnings.pol_credited events into user_stats_earnings_* (idempotent by eventId).
 *
 * Events are applied in batches: one transaction with three statements per batch (dedupe
 * insert, daily upsert, total upsert) instead of three round trips per event. The database
 * lives on another VM, so per-event transactions (~6 round trips each) could not keep up with
 * a block that credits thousands of users.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import {
  isEarningsEventEnvelope,
  utcDayKey,
  type DomainEventEnvelope,
  type EarningsEventPayload,
} from "./events.envelope.js";

const log = logger.child("events.stats-materialize");

export type EarningsSkipReason = "invalid_envelope" | "ignored_type" | "non_positive_amount" | "duplicate";

export type EarningsBatchResult = {
  applied: number;
  skipped: Record<EarningsSkipReason, number>;
};

type ValidEarningsEvent = {
  eventId: string;
  userId: number;
  dayKey: string;
  source: string;
  amount: Prisma.Decimal;
};

function classifyEvent(raw: unknown): ValidEarningsEvent | EarningsSkipReason {
  if (!isEarningsEventEnvelope(raw)) return "invalid_envelope";
  const event = raw as DomainEventEnvelope<EarningsEventPayload>;
  if (event.type !== "earnings.pol_credited") return "ignored_type";
  const amount = Number(event.payload.amountPol);
  if (!Number.isFinite(amount) || amount <= 0) return "non_positive_amount";
  return {
    eventId: event.eventId,
    userId: event.userId,
    dayKey: utcDayKey(event.occurredAt),
    source: event.payload.source,
    amount: new Prisma.Decimal(String(amount)),
  };
}

/** Sums amounts per key so each upsert row is unique (ON CONFLICT DO UPDATE cannot hit a row twice). */
function sumBy(events: ValidEarningsEvent[], keyOf: (e: ValidEarningsEvent) => string) {
  const groups = new Map<string, { sample: ValidEarningsEvent; amount: Prisma.Decimal }>();
  for (const e of events) {
    const key = keyOf(e);
    const g = groups.get(key);
    if (g) g.amount = g.amount.plus(e.amount);
    else groups.set(key, { sample: e, amount: e.amount });
  }
  return [...groups.values()];
}

export async function applyEarningsEventsBatch(raws: unknown[]): Promise<EarningsBatchResult> {
  const skipped: Record<EarningsSkipReason, number> = {
    invalid_envelope: 0,
    ignored_type: 0,
    non_positive_amount: 0,
    duplicate: 0,
  };
  const byId = new Map<string, ValidEarningsEvent>();
  for (const raw of raws) {
    const res = classifyEvent(raw);
    if (typeof res === "string") skipped[res] += 1;
    else if (byId.has(res.eventId)) skipped.duplicate += 1;
    else byId.set(res.eventId, res);
  }
  if (byId.size === 0) return { applied: 0, skipped };

  const ids = [...byId.keys()];
  const applied = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<{ event_id: string }[]>`
      INSERT INTO stats_event_dedupe (event_id)
      SELECT unnest(${ids}::varchar[])
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id`;
    const fresh = inserted.map((r) => byId.get(r.event_id)).filter((e): e is ValidEarningsEvent => !!e);
    if (fresh.length === 0) return fresh;

    const daily = sumBy(fresh, (e) => `${e.userId}|${e.dayKey}|${e.source}`);
    await tx.$executeRaw`
      INSERT INTO user_stats_earnings_daily (user_id, day_utc, source, amount_pol, updated_at)
      SELECT t.user_id, t.day_utc::date, t.source, t.amount_pol::numeric, now()
      FROM unnest(
        ${daily.map((g) => g.sample.userId)}::int[],
        ${daily.map((g) => g.sample.dayKey)}::text[],
        ${daily.map((g) => g.sample.source)}::varchar[],
        ${daily.map((g) => g.amount.toFixed())}::text[]
      ) AS t(user_id, day_utc, source, amount_pol)
      ON CONFLICT (user_id, day_utc, source) DO UPDATE
        SET amount_pol = user_stats_earnings_daily.amount_pol + EXCLUDED.amount_pol,
            updated_at = now()`;

    const total = sumBy(fresh, (e) => `${e.userId}|${e.source}`);
    await tx.$executeRaw`
      INSERT INTO user_stats_earnings_total (user_id, source, amount_pol, updated_at)
      SELECT t.user_id, t.source, t.amount_pol::numeric, now()
      FROM unnest(
        ${total.map((g) => g.sample.userId)}::int[],
        ${total.map((g) => g.sample.source)}::varchar[],
        ${total.map((g) => g.amount.toFixed())}::text[]
      ) AS t(user_id, source, amount_pol)
      ON CONFLICT (user_id, source) DO UPDATE
        SET amount_pol = user_stats_earnings_total.amount_pol + EXCLUDED.amount_pol,
            updated_at = now()`;
    return fresh;
  });

  skipped.duplicate += ids.length - applied.length;
  return { applied: applied.length, skipped };
}

export async function applyEarningsEvent(
  raw: unknown,
): Promise<{ applied: boolean; reason?: string }> {
  const res = classifyEvent(raw);
  if (typeof res === "string") return { applied: false, reason: res };
  try {
    const out = await applyEarningsEventsBatch([raw]);
    return out.applied === 1 ? { applied: true } : { applied: false, reason: "duplicate" };
  } catch (err) {
    log.error("applyEarningsEvent failed", {
      eventId: res.eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
