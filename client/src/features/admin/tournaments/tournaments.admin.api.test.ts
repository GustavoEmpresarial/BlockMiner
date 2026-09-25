import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../../shared/auth/auth.store', () => ({ api }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tournamentsAdminApi — client ↔ server API integration', () => {
  it('list chama GET /admin/tournaments', async () => {
    api.get.mockResolvedValueOnce({ data: { ok: true, tournaments: [] } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.list();

    expect(api.get).toHaveBeenCalledWith('/admin/tournaments');
  });

  it('create chama POST /admin/tournaments com body', async () => {
    const body = { name: 'New Tour', type: 'DAILY', metric: 'FAUCET' };
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.create(body);

    expect(api.post).toHaveBeenCalledWith('/admin/tournaments', body);
  });

  it('update chama PATCH /admin/tournaments/:id com body', async () => {
    const body = { name: 'Updated Name' };
    api.patch.mockResolvedValueOnce({ data: { ok: true } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.update(42, body);

    expect(api.patch).toHaveBeenCalledWith('/admin/tournaments/42', body);
  });

  it('cancel chama POST /admin/tournaments/:id/cancel', async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.cancel(42);

    expect(api.post).toHaveBeenCalledWith('/admin/tournaments/42/cancel');
  });

  it('finalize chama POST /admin/tournaments/:id/finalize', async () => {
    api.post.mockResolvedValueOnce({ data: { ok: true, ranked: 5, rewarded: 2 } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.finalize(42);

    expect(api.post).toHaveBeenCalledWith('/admin/tournaments/42/finalize');
  });

  it('entries chama GET /admin/tournaments/:id/entries com paginação', async () => {
    api.get.mockResolvedValueOnce({ data: { ok: true, entries: [] } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.entries(42, 2);

    expect(api.get).toHaveBeenCalledWith('/admin/tournaments/42/entries', {
      params: { page: 2 },
    });
  });

  it('getDisplayOrder e setDisplayOrder chamam /admin/tournaments/display-order', async () => {
    api.get.mockResolvedValueOnce({ data: { ok: true, typeOrder: ['DAILY'] } });
    api.patch.mockResolvedValueOnce({ data: { ok: true } });

    const { tournamentsAdminApi } = await import('./tournaments.admin.api');
    await tournamentsAdminApi.getDisplayOrder();
    await tournamentsAdminApi.setDisplayOrder(['DAILY', 'WEEKLY']);

    expect(api.get).toHaveBeenCalledWith('/admin/tournaments/display-order');
    expect(api.patch).toHaveBeenCalledWith('/admin/tournaments/display-order', {
      typeOrder: ['DAILY', 'WEEKLY'],
    });
  });
});
