import test from "node:test";
import assert from "node:assert/strict";

const {
  isOfferEventLiveAt,
  isOfferEventActiveForPublic,
  hasEventMinerStock,
  normalizeOfferCurrency,
  userBalanceFieldForCurrency,
  getUserBalanceNumber,
  offerEventDeliveryAt,
  offerMinerReleaseAt,
  isOfferMinerReleased,
  toDecimalPrice,
} = await import("../../server/modules/offer-events/offer-events.helpers.ts");

// ─── 1. Janelas Temporais de Eventos ──────────────────────────────────────────

test("isOfferEventLiveAt: evento ativo dentro do intervalo de tempo é live", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const event = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-09-28T23:59:59Z"),
    isActive: true,
    deletedAt: null,
  };
  assert.equal(isOfferEventLiveAt(now, event), true);
  assert.equal(isOfferEventActiveForPublic(now, event), true);
});

test("isOfferEventLiveAt: evento antes do início não é live", () => {
  const now = new Date("2026-09-27T23:59:59Z");
  const event = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-09-28T23:59:59Z"),
    isActive: true,
  };
  assert.equal(isOfferEventLiveAt(now, event), false);
});

test("isOfferEventLiveAt: evento após o término não é live", () => {
  const now = new Date("2026-09-29T00:00:01Z");
  const event = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-09-28T23:59:59Z"),
    isActive: true,
  };
  assert.equal(isOfferEventLiveAt(now, event), false);
});

test("isOfferEventLiveAt: evento inativo ou deletado não é live", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const eventInactive = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-09-28T23:59:59Z"),
    isActive: false,
  };
  assert.equal(isOfferEventLiveAt(now, eventInactive), false);

  const eventDeleted = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-09-28T23:59:59Z"),
    isActive: true,
    deletedAt: new Date("2026-09-28T10:00:00Z"),
  };
  assert.equal(isOfferEventLiveAt(now, eventDeleted), false);
});

// ─── 2. Verificação de Estoque de Mineradoras ─────────────────────────────────

test("hasEventMinerStock: mineradora inativa não tem estoque", () => {
  assert.equal(hasEventMinerStock({ isActive: false, stockUnlimited: true, stockCount: null, soldCount: 0 }), false);
});

test("hasEventMinerStock: mineradora com estoque ilimitado sempre tem estoque", () => {
  assert.equal(hasEventMinerStock({ isActive: true, stockUnlimited: true, stockCount: null, soldCount: 999 }), true);
});

test("hasEventMinerStock: mineradora limitada tem estoque quando soldCount < stockCount", () => {
  assert.equal(hasEventMinerStock({ isActive: true, stockUnlimited: false, stockCount: 10, soldCount: 9 }), true);
  assert.equal(hasEventMinerStock({ isActive: true, stockUnlimited: false, stockCount: 10, soldCount: 10 }), false);
  assert.equal(hasEventMinerStock({ isActive: true, stockUnlimited: false, stockCount: 10, soldCount: 15 }), false);
});

// ─── 3. Moedas Suportadas e Saldos ───────────────────────────────────────────

test("normalizeOfferCurrency: aceita moedas válidas em minúsculas ou maiúsculas", () => {
  assert.equal(normalizeOfferCurrency("pol"), "POL");
  assert.equal(normalizeOfferCurrency("POL"), "POL");
  assert.equal(normalizeOfferCurrency("blk"), "BLK");
  assert.equal(normalizeOfferCurrency("btc"), "BTC");
  assert.equal(normalizeOfferCurrency("eth"), "ETH");
  assert.equal(normalizeOfferCurrency("usdt"), "USDT");
  assert.equal(normalizeOfferCurrency("usdc"), "USDC");
  assert.equal(normalizeOfferCurrency("zer"), "ZER");
  assert.equal(normalizeOfferCurrency("desconhecido"), "BLK");
});

test("userBalanceFieldForCurrency & getUserBalanceNumber: extraem o saldo correto do usuário", () => {
  assert.equal(userBalanceFieldForCurrency("POL"), "polBalance");
  assert.equal(userBalanceFieldForCurrency("BLK"), "blkBalance");
  assert.equal(userBalanceFieldForCurrency("BTC"), "btcBalance");

  const user = {
    polBalance: 12.5,
    blkBalance: 100.0,
    btcBalance: 0.005,
  };
  assert.equal(getUserBalanceNumber(user, "POL"), 12.5);
  assert.equal(getUserBalanceNumber(user, "BLK"), 100.0);
  assert.equal(getUserBalanceNumber(user, "BTC"), 0.005);
  assert.equal(getUserBalanceNumber(user, "ETH"), 0);
});

// ─── 4. Conversão de Preço para Decimal ──────────────────────────────────────

test("toDecimalPrice: converte números e strings para string numérica e lança erro para inválidos", () => {
  assert.equal(toDecimalPrice(10), "10");
  assert.equal(toDecimalPrice("15.5"), "15.5");
  assert.equal(toDecimalPrice(0), "0");
  assert.throws(() => toDecimalPrice("invalid"), /invalid price/);
  assert.throws(() => toDecimalPrice(-5), /invalid price/);
});

test("offerEventDeliveryAt: imagem chega na hora; atraso conta dias UTC inteiros", () => {
  const purchasedAt = new Date("2026-09-30T18:00:00.000Z");
  assert.equal(offerEventDeliveryAt(purchasedAt, 0), null);
  assert.equal(offerEventDeliveryAt(purchasedAt, -3), null);
  const dayFive = offerEventDeliveryAt(purchasedAt, 5);
  assert.equal(dayFive?.toISOString(), "2026-10-05T18:00:00.000Z");
});

test("offerMinerReleaseAt: delay days after event start gate the sale", () => {
  const startsAt = new Date("2026-09-30T23:07:54.000Z");
  assert.equal(offerMinerReleaseAt(startsAt, 0), null);
  assert.equal(offerMinerReleaseAt(startsAt, 5)?.toISOString(), "2026-10-05T23:07:54.000Z");
  assert.equal(isOfferMinerReleased(new Date("2026-10-01T12:00:00.000Z"), startsAt, 5), false);
  assert.equal(isOfferMinerReleased(new Date("2026-10-05T23:07:54.000Z"), startsAt, 5), true);
  assert.equal(isOfferMinerReleased(new Date("2026-10-01T12:00:00.000Z"), startsAt, 0), true);
});
