import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../../shared/auth/auth.store', () => ({ api }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('banners.api — comunicação client ↔ server de banners admin', () => {
  it('listAdminBanners chama GET /admin/banners e retorna lista', async () => {
    const mockBanners = [
      { id: 1, title: 'Banner 1', type: 'promo', isActive: true },
      { id: 2, title: 'Banner 2', type: 'info', isActive: false },
    ];
    api.get.mockResolvedValueOnce({ data: { ok: true, banners: mockBanners } });

    const { listAdminBanners } = await import('./banners.api');
    const result = await listAdminBanners();

    expect(api.get).toHaveBeenCalledWith('/admin/banners');
    expect(result).toEqual(mockBanners);
  });

  it('createAdminBanner chama POST /admin/banners com payload do formulário', async () => {
    const bannerPayload = {
      title: 'Promoção Exclusiva',
      message: 'Descontos de 50%',
      imageUrl: 'https://example.com/banner.png',
      type: 'promo' as const,
      link: '/shop',
      linkLabel: 'Ir para Loja',
      isActive: true,
      startsAt: '2026-09-01T00:00',
      endsAt: '2026-09-30T00:00',
    };
    api.post.mockResolvedValueOnce({
      data: { ok: true, banner: { id: 10, ...bannerPayload } },
    });

    const { createAdminBanner } = await import('./banners.api');
    const result = await createAdminBanner(bannerPayload);

    expect(api.post).toHaveBeenCalledWith('/admin/banners', bannerPayload);
    expect(result.ok).toBe(true);
    expect(result.banner?.id).toBe(10);
  });

  it('updateAdminBanner chama PUT /admin/banners/:id com campos parciais', async () => {
    api.put.mockResolvedValueOnce({
      data: { ok: true, banner: { id: 5, title: 'Novo Título', isActive: true } },
    });

    const { updateAdminBanner } = await import('./banners.api');
    const result = await updateAdminBanner(5, { title: 'Novo Título' });

    expect(api.put).toHaveBeenCalledWith('/admin/banners/5', { title: 'Novo Título' });
    expect(result.ok).toBe(true);
  });

  it('toggleAdminBanner chama PUT /admin/banners/:id com isActive invertido', async () => {
    api.put.mockResolvedValueOnce({ data: { ok: true } });

    const { toggleAdminBanner } = await import('./banners.api');
    const result = await toggleAdminBanner(7, false);

    expect(api.put).toHaveBeenCalledWith('/admin/banners/7', { isActive: false });
    expect(result).toBe(true);
  });

  it('deleteAdminBanner chama DELETE /admin/banners/:id', async () => {
    api.delete.mockResolvedValueOnce({ data: { ok: true } });

    const { deleteAdminBanner } = await import('./banners.api');
    const result = await deleteAdminBanner(12);

    expect(api.delete).toHaveBeenCalledWith('/admin/banners/12');
    expect(result).toBe(true);
  });

  it('uploadBannerMedia envia FormData com multipart header e retorna a URL', async () => {
    api.post.mockResolvedValueOnce({
      data: { ok: true, url: 'https://blockminer.space/uploads/media.png' },
    });

    const { uploadBannerMedia } = await import('./banners.api');
    const file = new File(['content'], 'test.png', { type: 'image/png' });
    const url = await uploadBannerMedia(file);

    expect(api.post).toHaveBeenCalledWith(
      '/admin/upload-media',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    expect(url).toBe('https://blockminer.space/uploads/media.png');
  });
});
