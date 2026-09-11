import { api } from '../../../shared/auth/auth.store';
import type { AdminTournament, CatalogMiner, TournamentEntryRow } from './tournaments.admin.types';

type Ok = { ok: boolean; message?: string };

export const tournamentsAdminApi = {
  list: () => api.get<Ok & { tournaments?: AdminTournament[] }>('/admin/tournaments'),

  create: (body: Record<string, unknown>) =>
    api.post<Ok & { tournament?: AdminTournament }>('/admin/tournaments', body),

  update: (id: number, body: Record<string, unknown>) =>
    api.patch<Ok & { tournament?: AdminTournament }>(`/admin/tournaments/${id}`, body),

  cancel: (id: number) =>
    api.post<Ok & { tournament?: AdminTournament }>(`/admin/tournaments/${id}/cancel`),

  finalize: (id: number) =>
    api.post<Ok & { ranked?: number; rewarded?: number; nextId?: number | null }>(
      `/admin/tournaments/${id}/finalize`,
    ),

  entries: (id: number, page = 1) =>
    api.get<Ok & { entries?: TournamentEntryRow[]; total?: number; page?: number; limit?: number }>(
      `/admin/tournaments/${id}/entries`,
      { params: { page } },
    ),

  getDisplayOrder: () =>
    api.get<Ok & { typeOrder?: string[] }>('/admin/tournaments/display-order'),

  setDisplayOrder: (typeOrder: string[]) =>
    api.patch<Ok & { typeOrder?: string[] }>('/admin/tournaments/display-order', { typeOrder }),

  searchMiners: (q: string) =>
    api.get<Ok & { miners?: CatalogMiner[] }>('/admin/miners', {
      params: { q, limit: 20 },
    }),
};
