import { api } from '../../../shared/auth/auth.store';
import type {
  AdminSidebarNavResponse,
  AdminSidebarNavUpdateInput,
  AdminSidebarNavUpdateResponse,
  SidebarPersistedEntry,
} from './adminSidebarNav.types';

export const adminSidebarNavApi = {
  /**
   * GET /api/admin/sidebar-nav
   * Retorna entries persistidas, categorias resolvidas e metadados dos itens da sidebar.
   */
  getNavConfig: () =>
    api.get<AdminSidebarNavResponse>('/admin/sidebar-nav'),

  /**
   * PUT /api/admin/sidebar-nav
   * Atualiza a ordenação, visibilidade e parentesco das entradas da sidebar.
   */
  updateNavConfig: (entries: SidebarPersistedEntry[]) =>
    api.put<AdminSidebarNavUpdateResponse>('/admin/sidebar-nav', { entries } satisfies AdminSidebarNavUpdateInput),
};
