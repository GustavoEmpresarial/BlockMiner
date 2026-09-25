import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type {
  AdminBannerMutationResponse,
  AdminBannerRow,
  AdminBannersListResponse,
  BannerFormState,
  UploadMediaResponse,
} from './banners.types';

export async function listAdminBanners(): Promise<AdminBannerRow[]> {
  const res = await api.get<AdminBannersListResponse>('/admin/banners');
  if (res.data.ok && Array.isArray(res.data.banners)) {
    return res.data.banners;
  }
  return [];
}

export async function createAdminBanner(
  form: BannerFormState,
): Promise<{ ok: boolean; banner?: AdminBannerRow; message?: string }> {
  try {
    const res = await api.post<AdminBannerMutationResponse>('/admin/banners', form);
    if (res.data.ok) {
      return { ok: true, banner: res.data.banner };
    }
    return { ok: false, message: res.data.message || 'Erro ao criar banner.' };
  } catch (err: unknown) {
    return { ok: false, message: readAxiosResponseMessage(err) || 'Erro ao criar banner.' };
  }
}

export async function updateAdminBanner(
  id: number,
  form: Partial<BannerFormState>,
): Promise<{ ok: boolean; banner?: AdminBannerRow; message?: string }> {
  try {
    const res = await api.put<AdminBannerMutationResponse>(`/admin/banners/${id}`, form);
    if (res.data.ok) {
      return { ok: true, banner: res.data.banner };
    }
    return { ok: false, message: res.data.message || 'Erro ao atualizar banner.' };
  } catch (err: unknown) {
    return { ok: false, message: readAxiosResponseMessage(err) || 'Erro ao atualizar banner.' };
  }
}

export async function toggleAdminBanner(id: number, isActive: boolean): Promise<boolean> {
  const res = await api.put<AdminBannerMutationResponse>(`/admin/banners/${id}`, { isActive });
  return Boolean(res.data.ok);
}

export async function deleteAdminBanner(id: number): Promise<boolean> {
  const res = await api.delete<{ ok: boolean }>(`/admin/banners/${id}`);
  return Boolean(res.data.ok);
}

export async function uploadBannerMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('media', file);
  const res = await api.post<UploadMediaResponse>('/admin/upload-media', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  if (res.data.ok) {
    return res.data.url;
  }
  throw new Error(res.data.message || 'Falha no upload do arquivo.');
}
