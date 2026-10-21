/**
 * Kafka-less delivery: with KAFKA_ENABLED=false the app applies event_outbox rows to the stats
 * tables itself and marks them published; a failed batch stays unpublished for the next tick.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.KAFKA_ENABLED = "false";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;

let rows = [];
const marked = [];
let applyCalls = [];
let applyFails = false;
let kafkaTouched = false;
mock.module(spec("server/modules/events/events.outbox.ts"), {
  namedExports: {
    listUnpublishedOutbox: async (limit) => rows.slice(0, limit),
    markOutboxPublished: async (ids) => { marked.push(...ids); rows = rows.filter((r) => !ids.includes(r.id)); },
  },
});
mock.module(spec("server/modules/events/events.stats-materialize.ts"), {
  namedExports: {
    applyEarningsEventsBatch: async (payloads) => {
      applyCalls.push(payloads);
      if (applyFails) throw new Error("db down");
      return { applied: payloads.length, skipped: { invalid_envelope: 0, ignored_type: 0, non_positive_amount: 0, duplicate: 0 } };
    },
  },
});
mock.module(spec("server/modules/events/events.kafka.ts"), {
  namedExports: {
    getConnectedProducer: async () => { kafkaTouched = true; return null; },
    disconnectKafkaProducer: async () => {},
  },
});

const pub = await import("../../server/modules/events/events.outbox-publisher.ts");
const row = (id) => ({ id: BigInt(id), eventId: `e${id}`, topic: "bm.earnings.v1", payloadJson: { eventId: `e${id}`, type: "earnings.pol_credited" } });

test("without Kafka the outbox is applied straight to the stats and marked done (no broker touched)", async () => {
  rows = [row(1), row(2), row(3)];
  const r = await pub.publishOutboxBatchOnce();
  assert.deepEqual(r, { published: 3, skipped: 0 });
  assert.equal(applyCalls.length, 1);
  assert.deepEqual(applyCalls[0].map((p) => p.eventId), ["e1", "e2", "e3"]);
  assert.deepEqual(marked, [1n, 2n, 3n]);
  assert.equal(kafkaTouched, false);
});

test("a failed apply leaves the rows unpublished for the next tick", async () => {
  rows = [row(4)];
  applyFails = true;
  await assert.rejects(pub.publishOutboxBatchOnce(), /db down/);
  assert.equal(rows.length, 1);
  assert.ok(!marked.includes(4n));
  applyFails = false;
  await pub.publishOutboxBatchOnce();
  assert.ok(marked.includes(4n));
});

test("takes up to 500 rows per tick and does nothing on an empty outbox", async () => {
  rows = Array.from({ length: 700 }, (_, i) => row(100 + i));
  applyCalls = [];
  await pub.publishOutboxBatchOnce();
  assert.equal(applyCalls[0].length, 500);
  assert.equal(rows.length, 200);
  rows = [];
  assert.deepEqual(await pub.publishOutboxBatchOnce(), { published: 0, skipped: 0 });
});
