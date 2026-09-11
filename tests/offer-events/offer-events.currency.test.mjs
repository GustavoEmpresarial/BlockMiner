import test from "node:test";
import assert from "node:assert/strict";

const { DEFAULT_OFFER_CURRENCY } = await import(
  "../../server/modules/offer-events/offer-events.config.ts"
);
const { normalizeOfferCurrency, userBalanceFieldForCurrency } = await import(
  "../../server/modules/offer-events/offer-events.helpers.ts"
);

test("offer events default currency is BLK", () => {
  assert.equal(DEFAULT_OFFER_CURRENCY, "BLK");
  assert.equal(normalizeOfferCurrency(undefined), "BLK");
  assert.equal(normalizeOfferCurrency(null), "BLK");
  assert.equal(normalizeOfferCurrency(""), "BLK");
});

test("normalizeOfferCurrency maps BLK to blkBalance", () => {
  assert.equal(userBalanceFieldForCurrency("BLK"), "blkBalance");
  assert.equal(normalizeOfferCurrency("blk"), "BLK");
});

test("invalid currency falls back to BLK", () => {
  assert.equal(normalizeOfferCurrency("NOPE"), "BLK");
});
