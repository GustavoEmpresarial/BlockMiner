import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

import {
  clearActiveOffersCache,
  getActiveOfferEvents,
  hasLiveGearOffers,
  hasLiveRoomOffers,
  isActiveOffersPayloadLive,
  OFFER_PURCHASE_MAX_QUANTITY,
  postOfferEventPurchase,
  readGearMaxBulkQuantity,
  readOfferPurchaseError,
  postOfferFanPurchase,
  postOfferRackPurchase,
  readActiveOffersCache,
  writeActiveOffersCache,
  type FanOffersDTO,
  type OfferEventDTO,
  type RoomOffersDTO,
} from './offers.api';

const event: OfferEventDTO = { id: 7, title: 'Evento', isLive: true, miners: [{ id: 1 }] };
const rooms: RoomOffersDTO = { isLive: true, rooms: [{ roomNumber: 2, price: 10, listPrice: 20, currency: 'BLK', discountPercent: 50 }] };
const fans: FanOffersDTO = { isLive: true, items: [] };

function payload() {
  return { events: [event], roomOffers: rooms, fanOffers: fans, rackOffers: null };
}

describe('cache de ofertas ativas', () => {
  beforeEach(() => clearActiveOffersCache());

  it('começa vazio', () => {
    expect(readActiveOffersCache()).toBeNull();
  });

  it('devolve o que foi escrito — é o que evita a página piscar no remount da sidebar', () => {
    writeActiveOffersCache(payload());

    const cached = readActiveOffersCache();
    expect(cached?.events).toEqual([event]);
    expect(cached?.roomOffers).toEqual(rooms);
    expect(cached?.fanOffers).toEqual(fans);
    expect(cached?.rackOffers).toBeNull();
  });

  it('carimba fetchedAtMs na escrita', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      expect(writeActiveOffersCache(payload()).fetchedAtMs).toBe(1_700_000_000_000);
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
  });

  it('a escrita substitui por completo, nunca mescla com a anterior', () => {
    writeActiveOffersCache(payload());
    writeActiveOffersCache({ events: [], roomOffers: null, fanOffers: null, rackOffers: null });

    const cached = readActiveOffersCache();
    expect(cached?.events).toEqual([]);
    expect(cached?.roomOffers).toBeNull();
  });

  it('clear zera — é o caminho do logout, que não pode deixar oferta de outra sessão na tela', () => {
    writeActiveOffersCache(payload());
    clearActiveOffersCache();
    expect(readActiveOffersCache()).toBeNull();
  });

  it('o objeto devolvido por write é o mesmo que read enxerga', () => {
    const written = writeActiveOffersCache(payload());
    expect(readActiveOffersCache()).toBe(written);
  });
});

describe('caminhos HTTP da /offers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /offer-events/active', () => {
    void getActiveOfferEvents();
    expect(api.get).toHaveBeenCalledWith('/offer-events/active');
  });

  it('POST /offer-events/purchase — miner de evento, nunca fan/rack', () => {
    void postOfferEventPurchase({ eventMinerId: 11, quantity: 2 });
    expect(api.post).toHaveBeenCalledWith('/offer-events/purchase', { eventMinerId: 11, quantity: 2 });
    expect(api.post).not.toHaveBeenCalledWith('/offer-events/purchase-fan', expect.anything());
    expect(api.post).not.toHaveBeenCalledWith('/offer-events/purchase-rack', expect.anything());
  });

  it('POST /offer-events/purchase-fan e purchase-rack não trocam de lado', () => {
    void postOfferFanPurchase({ sku: 'FAN_BASIC', quantity: 1 });
    void postOfferRackPurchase({ sku: 'RACK_BASIC', quantity: 3 });
    expect(api.post).toHaveBeenCalledWith('/offer-events/purchase-fan', { sku: 'FAN_BASIC', quantity: 1 });
    expect(api.post).toHaveBeenCalledWith('/offer-events/purchase-rack', { sku: 'RACK_BASIC', quantity: 3 });
  });
});

describe('isActiveOffersPayloadLive — badge da sidebar e empty-state', () => {
  it('vazio / sem body não é live', () => {
    expect(isActiveOffersPayloadLive(null)).toBe(false);
    expect(isActiveOffersPayloadLive({})).toBe(false);
    expect(isActiveOffersPayloadLive({ events: [], roomOffers: null, fanOffers: null, rackOffers: null })).toBe(false);
  });

  it('evento na lista acende — regra histórica da sidebar', () => {
    expect(isActiveOffersPayloadLive({ events: [event] })).toBe(true);
  });

  it('sala / fan / rack só contam quando isLive e tem item', () => {
    expect(hasLiveRoomOffers({ isLive: true, rooms: [] })).toBe(false);
    expect(hasLiveRoomOffers(rooms)).toBe(true);
    expect(hasLiveGearOffers({ isLive: true, items: [] })).toBe(false);
    expect(hasLiveGearOffers({ isLive: false, items: [{ sku: 'FAN_BASIC', nameKey: 'x', descriptionKey: 'y', price: 1, listPrice: 2, currency: 'BLK' }] })).toBe(false);
    expect(isActiveOffersPayloadLive({ events: [], fanOffers: fans })).toBe(false);
    expect(isActiveOffersPayloadLive({
      events: [],
      fanOffers: { isLive: true, items: [{ sku: 'FAN_BASIC', nameKey: 'x', descriptionKey: 'y', price: 1, listPrice: 2, currency: 'BLK' }] },
    })).toBe(true);
    expect(isActiveOffersPayloadLive({
      events: [],
      rackOffers: { isLive: true, items: [{ sku: 'RACK_BASIC', nameKey: 'x', descriptionKey: 'y', price: 1, listPrice: 2, currency: 'BLK' }] },
    })).toBe(true);
    expect(isActiveOffersPayloadLive({ events: [], roomOffers: rooms })).toBe(true);
  });
});

describe('limites e erros alinhados ao backend', () => {
  it('OFFER_PURCHASE_MAX_QUANTITY é 25 — o mesmo cap de POST /purchase', () => {
    expect(OFFER_PURCHASE_MAX_QUANTITY).toBe(25);
  });

  it('readGearMaxBulkQuantity usa o eco do GET /active, senão o cap do miner', () => {
    expect(readGearMaxBulkQuantity({ maxBulkQuantity: 10 })).toBe(10);
    expect(readGearMaxBulkQuantity({ maxBulkQuantity: 0 })).toBe(OFFER_PURCHASE_MAX_QUANTITY);
    expect(readGearMaxBulkQuantity(null)).toBe(OFFER_PURCHASE_MAX_QUANTITY);
  });

  it('readOfferPurchaseError prefere messageKey traduzido — não o message em inglês', () => {
    const t = (key: string) => (key === 'fans.errors.invalid_sku' ? 'SKU inválido' : key);
    const err = {
      isAxiosError: true,
      response: { data: { messageKey: 'fans.errors.invalid_sku', message: 'Invalid fan product.' } },
    };
    expect(readOfferPurchaseError(err, 'fallback', t)).toBe('SKU inválido');
  });

  it('readOfferPurchaseError cai no message se o i18n não tiver a chave', () => {
    const t = (key: string) => key;
    const err = {
      isAxiosError: true,
      response: { data: { messageKey: 'missing.key', message: 'Invalid fan product.' } },
    };
    expect(readOfferPurchaseError(err, 'fallback', t)).toBe('Invalid fan product.');
  });
});
