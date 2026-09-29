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
    api.get<AdminBurnEventsListResponse>('/admin/burn-events'),

  create: (body: AdminCreateBurnEventPayload) =>
    api.post<AdminBurnEventDetailResponse>('/admin/burn-events', body),

  update: (id: number, body: AdminUpdateBurnEventPayload) =>
    api.patch<AdminBurnEventDetailResponse>(`/admin/burn-events/${id}`, body),

  remove: (id: number) =>
    api.delete<{ ok: boolean; message?: string }>(`/admin/burn-events/${id}`),

  listClaims: (id: number, page = 1) =>
    api.get<AdminBurnEventClaimsResponse>(`/admin/burn-events/${id}/claims?page=${page}`),

  listCatalogMiners: () =>
    api.get<{ ok: boolean; miners?: CatalogMiner[]; message?: string }>('/admin/miners'),
};
