import test from "node:test";
import assert from "node:assert/strict";
import * as payment from "../../server/modules/parts/parts.merge-payment.ts";

const prices = { POL: 0.25, SHIB: 0.00001 };

test("BLK fee is 15% of base price", () => {
  const q = payment.quoteMergeFee(20, "BLK", prices);
  assert.equal(q.feePercent, 15);
  assert.equal(q.feeUsd, 3);
  assert.equal(q.amount, 3);
});

test("crypto fee is 10% of base price (5 points cheaper), converted at USD price", () => {
  const pol = payment.quoteMergeFee(20, "POL", prices);
  assert.equal(pol.feePercent, 10);
  assert.equal(pol.feeUsd, 2);
  assert.equal(pol.amount, 8);
  const shib = payment.quoteMergeFee(20, "SHIB", prices);
  assert.equal(shib.feeUsd, 2);
  assert.equal(shib.amount, 200000);
  assert.equal(payment.MERGE_CRYPTO_DISCOUNT_POINTS, 5);
});

test("crypto quote is unavailable without a price", () => {
  assert.equal(payment.quoteMergeFee(20, "POL", { POL: 0, SHIB: 0 }), null);
  assert.equal(payment.quoteAllMergeFees(20, { POL: 0, SHIB: 0 }).length, 1);
});

test("unknown payment asset falls back to BLK", () => {
  assert.equal(payment.parseMergePaymentAsset("pol"), "POL");
  assert.equal(payment.parseMergePaymentAsset("eth"), "BLK");
  assert.equal(payment.parseMergePaymentAsset(undefined), "BLK");
});
