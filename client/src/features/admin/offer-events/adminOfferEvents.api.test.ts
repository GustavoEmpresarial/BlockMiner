import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminOfferEvents.api — paths da aba Ofertas', () => {
  it('listAdminOfferEvents pede o pageSize máximo — a grid não pagina', async () => {
    const { listAdminOfferEvents, ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE } = await import('./adminOfferEvents.api');
    listAdminOfferEvents();
    expect(api.get).toHaveBeenCalledWith('/admin/offer-events', {
      params: { pageSize: ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE },
    });
    expect(ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE).toBe(100);
  });

  it('getAdminOfferEvent → GET /admin/offer-events/:id', async () => {
    const { getAdminOfferEvent } = await import('./adminOfferEvents.api');
    getAdminOfferEvent(9);
    expect(api.get).toHaveBeenCalledWith('/admin/offer-events/9');
  });

  it('createAdminOfferEvent → POST /admin/offer-events', async () => {
    const { createAdminOfferEvent } = await import('./adminOfferEvents.api');
    const body = {
      title: 'Evento',
      description: 'Desc',
      imageUrl: null,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-01-02T00:00:00.000Z',
      isActive: true,
    };
    createAdminOfferEvent(body);
    expect(api.post).toHaveBeenCalledWith('/admin/offer-events', body);
  });

  it('updateAdminOfferEvent aceita patch parcial (toggle isActive da lista)', async () => {
    const { updateAdminOfferEvent } = await import('./adminOfferEvents.api');
    updateAdminOfferEvent(4, { isActive: false });
    expect(api.put).toHaveBeenCalledWith('/admin/offer-events/4', { isActive: false });
  });

  it('deleteAdminOfferEvent → DELETE /admin/offer-events/:id', async () => {
    const { deleteAdminOfferEvent } = await import('./adminOfferEvents.api');
    deleteAdminOfferEvent(4);
    expect(api.delete).toHaveBeenCalledWith('/admin/offer-events/4');
  });

  it('miners: list/create/update/delete não trocam eventId por minerId', async () => {
    const {
      listAdminOfferEventMiners,
      createAdminOfferEventMiner,
      updateAdminOfferEventMiner,
      deleteAdminOfferEventMiner,
    } = await import('./adminOfferEvents.api');
    const miner = {
      name: 'Harvest',
      description: '',
      imageUrl: null,
      price: 15,
      hashRate: 1,
      currency: 'POL',
      stockUnlimited: true,
      stockCount: null,
      slotSize: 1,
      isActive: true,
      isFree: false,
      claimLimitPerUser: 1,
    };

    listAdminOfferEventMiners(7);
    createAdminOfferEventMiner(7, miner);
    updateAdminOfferEventMiner(7, 3, miner);
    deleteAdminOfferEventMiner(7, 3);

    expect(api.get).toHaveBeenCalledWith('/admin/offer-events/7/miners');
    expect(api.post).toHaveBeenCalledWith('/admin/offer-events/7/miners', miner);
    expect(api.put).toHaveBeenCalledWith('/admin/offer-events/7/miners/3', miner);
    expect(api.delete).toHaveBeenCalledWith('/admin/offer-events/7/miners/3');
  });

  it('listAdminOfferEventPurchases usa o pageSize canônico e aceita userId', async () => {
    const { listAdminOfferEventPurchases, ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE } =
      await import('./adminOfferEvents.api');

    listAdminOfferEventPurchases(7);
    expect(api.get).toHaveBeenCalledWith('/admin/offer-events/7/purchases', {
      params: { pageSize: ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE },
    });

    listAdminOfferEventPurchases(7, { pageSize: 50, userId: 363 });
    expect(api.get).toHaveBeenCalledWith('/admin/offer-events/7/purchases', {
      params: { pageSize: 50, userId: 363 },
    });
  });
});
