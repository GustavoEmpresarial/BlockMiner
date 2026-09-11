import { api } from '../../../shared/auth/auth.store';
import type { AdminMinersListResponse, AdminMinersQuery, AdminMinerListRow } from './adminMiners.types';

export const adminMinersApi = {
  list: (params?: { q?: string; includeArchived?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.q?.trim()) qs.set('q', params.q.trim());
    if (params?.includeArchived) qs.set('includeArchived', '1');
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return api.get<{ ok: boolean; miners?: AdminMinerListRow[]; total?: number; message?: string }>(
      `/admin/miners${suffix}`,
    );
  },
  create: (body: unknown) => api.post('/admin/miners', body),
  update: (id: number | string, body: unknown) => api.patch(`/admin/miners/${id}`, body),
  toggleActive: (id: number | string) => api.post(`/admin/miners/${id}/toggle-active`),
  toggleStore: (id: number | string) => api.post(`/admin/miners/${id}/toggle-store`),
  uploadImage: async (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    const { data } = await api.post<{ ok?: boolean; url?: string; message?: string }>(
      '/admin/upload-image?category=miners',
      fd,
    );
    if (!data.ok || !data.url) throw new Error(data.message ?? 'Image upload failed.');
    return data.url;
  },
};

export async function fetchAdminMiners(
  params: AdminMinersQuery,
  signal?: AbortSignal,
): Promise<AdminMinersListResponse> {
  const includeArchived = params.filter === 'archived' || params.filter === 'all';
  const res = await adminMinersApi.list({ q: params.q, includeArchived });
  const data = res.data;
  if (!data.ok) {
    return {
      ok: false,
      error: data.message ?? 'Erro ao carregar mineradoras',
      message: data.message,
    };
  }
  let miners = data.miners ?? [];
  const sort = params.sort || 'name';
  miners = [...miners].sort((a, b) => {
    if (sort === 'id') return Number(a.id) - Number(b.id);
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
  const total = data.total ?? miners.length;
  const start = (params.page - 1) * params.limit;
  const slice = miners.slice(start, start + params.limit);
  return {
    ok: true,
    miners: slice,
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
  };
}
