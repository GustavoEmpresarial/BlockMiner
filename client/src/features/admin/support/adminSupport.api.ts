import { api } from '../../../shared/auth/auth.store';
import type {
  AdminSupportArchiveResponse,
  AdminSupportCleanupResponse,
  AdminSupportCreditPolInput,
  AdminSupportCreditPolResponse,
  AdminSupportListApiResponse,
  AdminSupportListFilter,
  AdminSupportMessageApiResponse,
  AdminSupportPlayerDossierBundle,
  AdminSupportPlayerDossierParams,
  AdminSupportReplyInput,
  AdminSupportReplyPostResponse,
  AdminSupportUploadImageResponse,
} from './adminSupport.types';

export const adminSupportApi = {
  /**
   * GET /api/admin/support
   * Listar tickets de suporte de jogadores autenticados.
   */
  listMessages: (params?: { page?: number; limit?: number; userId?: number; archived?: boolean; status?: AdminSupportListFilter }) => {
    const query: Record<string, string | number> = {};
    if (params?.page != null) query.page = params.page;
    if (params?.limit != null) query.limit = params.limit;
    if (params?.userId != null) query.userId = params.userId;
    if (params?.archived != null) query.archived = params.archived ? '1' : '0';
    if (params?.status && params.status !== 'all') query.status = params.status;
    return api.get<AdminSupportListApiResponse>('/admin/support', { params: query });
  },

  /**
   * GET /api/admin/support/:id
   * Obter detalhes e réplicas de um ticket.
   */
  getMessage: (ticketId: number) =>
    api.get<AdminSupportMessageApiResponse>(`/admin/support/${ticketId}`),

  /**
   * POST /api/admin/support/:id/reply
   * Responder ao ticket do jogador.
   */
  reply: (ticketId: number, body: AdminSupportReplyInput) =>
    api.post<AdminSupportReplyPostResponse>(`/admin/support/${ticketId}/reply`, body),

  /**
   * POST /api/admin/support/:id/archive
   * Alternar estado de arquivamento / fechamento do ticket.
   */
  setArchived: (ticketId: number, archived: boolean) =>
    api.post<AdminSupportArchiveResponse>(`/admin/support/${ticketId}/archive`, { archived }),

  /**
   * POST /api/admin/support/cleanup-retention
   * Limpar tickets inativos com mais de 30 dias.
   */
  cleanupRetention: () =>
    api.post<AdminSupportCleanupResponse>('/admin/support/cleanup-retention'),

  /**
   * GET /api/admin/support/:id/player-dossier
   * Obter dossiê agregado completo do jogador.
   */
  getDossier: (ticketId: number, params: AdminSupportPlayerDossierParams) =>
    api.get<AdminSupportPlayerDossierBundle>(`/admin/support/${ticketId}/player-dossier`, { params }),

  /**
   * POST /api/admin/support/:id/credit-pol
   * Creditar POL de suporte na conta do jogador.
   */
  creditPol: (ticketId: number, body: AdminSupportCreditPolInput) =>
    api.post<AdminSupportCreditPolResponse>(`/admin/support/${ticketId}/credit-pol`, body),

  /**
   * POST /api/admin/upload-image
   * Upload de anexo de imagem do suporte.
   */
  uploadImage: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return api.post<AdminSupportUploadImageResponse>('/admin/upload-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
