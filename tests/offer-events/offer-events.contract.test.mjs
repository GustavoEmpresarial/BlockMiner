import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX,
  ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX,
  OFFER_EVENT_PURCHASE_MAX_QUANTITY,
} from "../../server/modules/offer-events/offer-events.config.ts";
import {
  listEventsQuerySchema,
  listPurchasesQuerySchema,
  purchaseFanSchema,
  purchaseRackSchema,
  purchaseSchema,
} from "../../server/modules/offer-events/offer-events.schemas.ts";

describe("contrato HTTP offer-events ↔ client", () => {
  it("POST /purchase rejeita quantity acima do cap nomeado", () => {
    assert.equal(OFFER_EVENT_PURCHASE_MAX_QUANTITY, 25);
    assert.equal(purchaseSchema.safeParse({ eventMinerId: 1, quantity: 25 }).success, true);
    assert.equal(purchaseSchema.safeParse({ eventMinerId: 1, quantity: 26 }).success, false);
  });

  it("POST /purchase-fan e /purchase-rack exigem sku + quantity inteiro ≥ 1", () => {
    assert.equal(purchaseFanSchema.safeParse({ sku: "cooling_fan_system", quantity: 2 }).success, true);
    assert.equal(purchaseRackSchema.safeParse({ sku: "mining_rack_shelf", quantity: 1 }).success, true);
    assert.equal(purchaseFanSchema.safeParse({ sku: "", quantity: 1 }).success, false);
    assert.equal(purchaseRackSchema.safeParse({ sku: "mining_rack_shelf", quantity: 0 }).success, false);
    assert.equal(purchaseFanSchema.safeParse({ sku: "cooling_fan_system", extra: true }).success, false);
  });

  it("GET /admin/offer-events pageSize max é 100 — o client pede exatamente isso", () => {
    assert.equal(ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX, 100);
    assert.equal(listEventsQuerySchema.safeParse({ pageSize: 100 }).success, true);
    assert.equal(listEventsQuerySchema.safeParse({ pageSize: 101 }).success, false);
  });

  it("GET /admin/offer-events/:id/purchases aceita pageSize 200 e rejeita 201", () => {
    assert.equal(ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX, 200);
    assert.equal(listPurchasesQuerySchema.safeParse({ pageSize: 200 }).success, true);
    assert.equal(listPurchasesQuerySchema.safeParse({ pageSize: 201 }).success, false);
  });
});
