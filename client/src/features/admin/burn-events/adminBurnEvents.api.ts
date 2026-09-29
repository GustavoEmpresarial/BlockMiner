import { api } from '../../../shared/auth/auth.store';
import type {
  AdminBurnEventsListResponse,
  AdminBurnEventDetailResponse,
  AdminBurnEventClaimsResponse,
  AdminCreateBurnEventPayload,
  AdminUpdateBurnEventPayload,
  CatalogMiner,
} from './adminBurnEvents.types';

export const adminBurnEventsApi = {
  listAll: () =>
    api.get<AdminBurnEventsListResponse>('/api/admin/burn-events'),

  create: (body: AdminCreateBurnEventPayload) =>
    api.post<AdminBurnEventDetailResponse>('/api/admin/burn-events', body),

  update: (id: number, body: AdminUpdateBurnEventPayload) =>
    api.patch<AdminBurnEventDetailResponse>(`/api/admin/burn-events/${id}`, body),

  remove: (id: number) =>
    api.delete<{ ok: boolean; message?: string }>(`/api/admin/burn-events/${id}`),

  listClaims: (id: number, page = 1) =>
    api.get<AdminBurnEventClaimsResponse>(`/api/admin/burn-events/${id}/claims?page=${page}`),

  listCatalogMiners: () =>
    api.get<{ ok: boolean; miners?: CatalogMiner[]; message?: string }>('/api/admin/miners'),
};
