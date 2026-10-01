import { api } from '../../../shared/auth/auth.store';
import type {
  AdminAdjustBalanceInput,
  AdminBanUserInput,
  AdminResetPasswordInput,
  AdminSendMinerInput,
  AdminUserActivitySummaryResponse,
  AdminUserDetailsPayload,
  AdminUserRelatedResponse,
  AdminUserTicketsResponse,
  AdminUserWalletLedgerResponse,
  AdminUsersListApiResponse,
  MinersCatalogResponse,
} from './adminUsers.types';

export const adminUsersApi = {
  /**
   * GET /api/admin/users
   * Listar usuários com suporte a busca, filtro de status (all/active/banned) e paginação.
   */
  listUsers: (params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: 'all' | 'active' | 'banned';
    fromDate?: string;
    toDate?: string;
  }) => {
    const q: Record<string, string | number> = { pageSize: params?.pageSize ?? 25 };
    if (params?.page != null) q.page = params.page;
    if (params?.query?.trim()) q.query = params.query.trim();
    if (params?.status && params.status !== 'all') q.status = params.status;
    if (params?.fromDate) q.fromDate = params.fromDate;
    if (params?.toDate) q.toDate = params.toDate;
    return api.get<AdminUsersListApiResponse>('/admin/users', { params: q });
  },

  /**
   * GET /api/admin/users/:id
   * Obter perfil completo de usuário e métricas consolidadas.
   */
  getUserDetail: (id: number | string) =>
    api.get<AdminUserDetailsPayload>(`/admin/users/${id}`),

  /**
   * GET /api/admin/users/:id/tickets
   * Listar tickets de suporte do usuário.
   */
  getUserTickets: (id: number | string) =>
    api.get<AdminUserTicketsResponse>(`/admin/users/${id}/tickets`),

  /**
   * GET /api/admin/users/:id/related
   * Listar contas relacionadas (mesmo IP, carteira ou fingerprint de dispositivo).
   */
  getRelatedUsers: (id: number | string) =>
    api.get<AdminUserRelatedResponse>(`/admin/users/${id}/related`),

  /**
   * GET /api/admin/users/:id/wallet-ledger
   * Obter balanços de todas as moedas e endereço de carteira.
   */
  getWalletLedger: (id: number | string) =>
    api.get<AdminUserWalletLedgerResponse>(`/admin/users/${id}/wallet-ledger`),

  /**
   * GET /api/admin/users/:id/activity-summary
   * Resumo de sessões e atividade (auto-mining, youtube watch, heartbeat).
   */
  getActivitySummary: (id: number | string) =>
    api.get<AdminUserActivitySummaryResponse>(`/admin/users/${id}/activity-summary`),

  /**
   * POST /api/admin/users/:id/ban
   * Banir usuário com motivo e duração opcional.
   */
  banUser: (id: number | string, body: AdminBanUserInput) =>
    api.post<{ ok: boolean; message: string; user?: unknown }>(`/admin/users/${id}/ban`, body),

  /**
   * POST /api/admin/users/:id/unban
   * Desbanir usuário.
   */
  unbanUser: (id: number | string, reason?: string) =>
    api.post<{ ok: boolean; message: string; user?: unknown }>(`/admin/users/${id}/unban`, { reason }),

  /**
   * POST /api/admin/users/:id/adjust-balance
   * Ajustar saldo de uma moeda (POL, BLK, SHIB, BTC, ETH, USDT, USDC, ZER).
   */
  adjustBalance: (id: number | string, body: AdminAdjustBalanceInput) =>
    api.post<{
      ok: boolean;
      user?: unknown;
      prev: number;
      next: number;
      delta: number;
      message?: string;
    }>(`/admin/users/${id}/adjust-balance`, body),

  /**
   * POST /api/admin/users/:id/unlock
   * Remover lockout de segurança (SEC_LOCK).
   */
  unlockUser: (id: number | string) =>
    api.post<{ ok: boolean; message: string }>(`/admin/users/${id}/unlock`),

  /**
   * POST /api/admin/users/:id/reset-password
   * Redefinir senha da conta (manual ou gerada automaticamente).
   */
  resetPassword: (id: number | string, body?: AdminResetPasswordInput) =>
    api.post<{ ok: boolean; message: string; generatedPassword?: string }>(
      `/admin/users/${id}/reset-password`,
      body ?? {}
    ),

  /**
   * POST /api/admin/users/:id/send-miner
   * Conceder mineradora ativa ao inventário do jogador.
   */
  sendMiner: (id: number | string, body: AdminSendMinerInput) =>
    api.post<{ ok: boolean; message: string }>(`/admin/users/${id}/send-miner`, body),

  /**
   * GET /api/admin/miners
   * Obter catálogo de mineradoras para concessão.
   */
  fetchCatalogMiners: () =>
    api.get<MinersCatalogResponse>('/admin/miners'),
};
