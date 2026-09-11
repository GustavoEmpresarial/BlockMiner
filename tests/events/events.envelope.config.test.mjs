import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_EVENT_OUTBOX_PUBLISH_CRON_MS,
  DEFAULT_KAFKA_TOPIC_EARNINGS,
  DEFAULT_STATS_MATERIALIZATION_MAX_LAG_MS,
  isKafkaEnabled,
  readEventOutboxPublishCronMs,
  readKafkaTopicEarnings,
  readStatsMaterializationMaxLagMs,
} from "../../server/modules/events/events.config.ts";
import {
  buildEarningsPolCreditedEvent,
  isEarningsEventEnvelope,
  utcDayKey,
} from "../../server/modules/events/events.envelope.ts";

describe("events.config", () => {
  it("defaults topic and lag from named constants", () => {
    assert.equal(readKafkaTopicEarnings(undefined), DEFAULT_KAFKA_TOPIC_EARNINGS);
    assert.equal(DEFAULT_KAFKA_TOPIC_EARNINGS, "bm.earnings.v1");
    assert.equal(readStatsMaterializationMaxLagMs(undefined), DEFAULT_STATS_MATERIALIZATION_MAX_LAG_MS);
    assert.equal(readEventOutboxPublishCronMs(undefined), DEFAULT_EVENT_OUTBOX_PUBLISH_CRON_MS);
  });

  it("reads topic override from env-shaped raw", () => {
    assert.equal(readKafkaTopicEarnings("  bm.earnings.custom  "), "bm.earnings.custom");
  });

  it("isKafkaEnabled respects off/on", () => {
    assert.equal(isKafkaEnabled("0"), false);
    assert.equal(isKafkaEnabled("false"), false);
    assert.equal(isKafkaEnabled("1"), true);
  });
});

describe("earnings envelope", () => {
  it("buildEarningsPolCreditedEvent produces a valid envelope", () => {
    const ev = buildEarningsPolCreditedEvent({
      userId: 42,
      source: "mining",
      amountPol: 1.25,
      occurredAt: new Date("2026-09-01T12:00:00.000Z"),
      eventId: "test-event-1",
      ref: "block:9",
    });
    assert.equal(ev.type, "earnings.pol_credited");
    assert.equal(ev.userId, 42);
    assert.equal(ev.payload.source, "mining");
    assert.equal(ev.payload.amountPol, 1.25);
    assert.equal(ev.payload.ref, "block:9");
    assert.equal(ev.schemaVersion, 1);
    assert.ok(isEarningsEventEnvelope(ev));
  });

  it("rejects invalid envelopes", () => {
    assert.equal(isEarningsEventEnvelope(null), false);
    assert.equal(isEarningsEventEnvelope({ eventId: "x" }), false);
    assert.equal(
      isEarningsEventEnvelope({
        eventId: "x",
        type: "earnings.pol_credited",
        userId: 1,
        occurredAt: "2026-09-01T00:00:00.000Z",
        schemaVersion: 1,
        payload: { source: "mining", amountPol: "nope" },
      }),
      false,
    );
  });

  it("utcDayKey uses UTC calendar day", () => {
    assert.equal(utcDayKey("2026-09-01T23:30:00.000Z"), "2026-09-01");
    assert.equal(utcDayKey(new Date("2026-09-02T00:00:00.000Z")), "2026-09-02");
  });
});
