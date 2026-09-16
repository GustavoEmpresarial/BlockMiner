import { beforeEach, describe, expect, it, vi } from 'vitest';

// offers.api só usa `api` para as 4 chamadas de rede; o cache é estado de módulo puro.
vi.mock('../../../shared/auth/auth.store', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import {
  clearActiveOffersCache,
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
