/**
 * Unit: bulk outbox enqueue.
 *
 * Why it exists: the block settlement issued ONE `eventOutbox.create()` per miner inside the
 * interactive transaction. On 15/09/2026 that pushed the settlement past Prisma's 15s budget
 * and block 24628 failed with P2028 ("A query cannot be executed on an expired transaction"),
 * retrying up to 12 times before rewards landed. The rows are now bulk-inserted, chunked like
 * every other write in that transaction.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEarningsPolCreditedOutboxRow,
  enqueueOutboxManyTx,
} from "../../server/modules/events/events.outbox.ts";

function fakeTx() {
  const calls = [];
  return {
    calls,
    eventOutbox: {
      createMany: async (args) => {
        calls.push(args);
        return { count: args.data.length };
      },
      create: async () => {
        throw new Error("create() must not be used for bulk enqueue");
      },
    },
  };
}

describe("enqueueOutboxManyTx", () => {
  it("writes 500 rows in a single round-trip instead of 500", async () => {
    const tx = fakeTx();
    const rows = Array.from({ length: 500 }, (_, i) => ({
      eventId: `mining:24628:${i}`,
      topic: "earnings",
      payloadJson: { userId: i },
    }));

    const written = await enqueueOutboxManyTx(tx, rows, 500);

    assert.equal(written, 500);
    assert.equal(tx.calls.length, 1, "500 rows must cost one statement, not 500");
    assert.equal(tx.calls[0].skipDuplicates, true, "a replayed settlement must stay idempotent");
  });

  it("chunks so one huge insert never serialises the whole transaction", async () => {
    const tx = fakeTx();
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      eventId: `e${i}`,
      topic: "earnings",
      payloadJson: {},
    }));

    const written = await enqueueOutboxManyTx(tx, rows, 500);

    assert.equal(written, 1200);
    assert.deepEqual(
      tx.calls.map((c) => c.data.length),
      [500, 500, 200],
    );
  });

  it("is a no-op for an empty settlement (no statement at all)", async () => {
    const tx = fakeTx();
    assert.equal(await enqueueOutboxManyTx(tx, []), 0);
    assert.equal(tx.calls.length, 0);
  });

  it("preserves eventId / topic / payload verbatim", async () => {
    const tx = fakeTx();
    await enqueueOutboxManyTx(tx, [{ eventId: "mining:1:7", topic: "t", payloadJson: { a: 1 } }]);
    assert.deepEqual(tx.calls[0].data[0], { eventId: "mining:1:7", topic: "t", payloadJson: { a: 1 } });
  });
});

describe("buildEarningsPolCreditedOutboxRow", () => {
  it("builds a row with the caller's deterministic eventId (replay-safe)", () => {
    const row = buildEarningsPolCreditedOutboxRow({
      userId: 42,
      source: "mining",
      amountPol: 0.5,
      occurredAt: new Date("2026-09-15T23:00:00.000Z"),
      eventId: "mining:24628:42",
      ref: "block:24628",
    });
    assert.equal(row?.eventId, "mining:24628:42");
    assert.ok(row?.topic);
    assert.ok(row?.payloadJson);
  });

  it("drops non-credits exactly like the per-row helper did", () => {
    const base = { source: "mining", occurredAt: new Date(), ref: "block:1" };
    assert.equal(buildEarningsPolCreditedOutboxRow({ ...base, userId: 1, amountPol: 0 }), null);
    assert.equal(buildEarningsPolCreditedOutboxRow({ ...base, userId: 1, amountPol: -3 }), null);
    assert.equal(buildEarningsPolCreditedOutboxRow({ ...base, userId: 1, amountPol: Number.NaN }), null);
    assert.equal(buildEarningsPolCreditedOutboxRow({ ...base, userId: 0, amountPol: 1 }), null);
  });
});
