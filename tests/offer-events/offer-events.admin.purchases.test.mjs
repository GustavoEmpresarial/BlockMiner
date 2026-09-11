import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateOfferEventPurchases } from "../../server/modules/offer-events/offer-events.admin.purchases.ts";

describe("aggregateOfferEventPurchases", () => {
  it("collapses same-timestamp unit rows into one batch with qty and total", () => {
    const ts = "2026-07-31T19:18:30.000Z";
    const batches = aggregateOfferEventPurchases([
      { id: 10, userId: 363, eventMinerId: 5, pricePaid: 15, currency: "POL", createdAt: ts, minerName: "Harvest Hash" },
      { id: 11, userId: 363, eventMinerId: 5, pricePaid: 15, currency: "POL", createdAt: ts, minerName: "Harvest Hash" },
      { id: 12, userId: 363, eventMinerId: 5, pricePaid: 15, currency: "POL", createdAt: ts, minerName: "Harvest Hash" },
      { id: 9, userId: 916, eventMinerId: 3, pricePaid: 1, currency: "POL", createdAt: "2026-07-31T20:19:58.000Z", minerName: "Bonfire Miner" },
    ]);

    assert.equal(batches.length, 2);
    // Sorted by batch id desc (min unit id kept as batch id).
    assert.equal(batches[0].userId, 363);
    assert.equal(batches[0].quantity, 3);
    assert.equal(batches[0].totalPaid, 45);
    assert.equal(batches[0].unitPrice, 15);
    assert.equal(batches[0].id, 10);
    assert.equal(batches[1].userId, 916);
    assert.equal(batches[1].quantity, 1);
    assert.equal(batches[1].totalPaid, 1);
  });

  it("passes through already-aggregated API rows", () => {
    const batches = aggregateOfferEventPurchases([
      {
        id: 1,
        userId: 1,
        eventMinerId: 2,
        pricePaid: 15,
        currency: "POL",
        createdAt: "2026-07-31T16:24:11.000Z",
        quantity: 20,
        totalPaid: 300,
        minerName: "Harvest Hash",
      },
    ]);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].quantity, 20);
    assert.equal(batches[0].totalPaid, 300);
  });
});
