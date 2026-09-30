import { api } from '../../../shared/auth/auth.store';
import type {
  AdminPublicSupportQuery,
  AdminPublicSupportReplyInput,
  AdminPublicSupportReplyResponse,
  AdminPublicSupportStatusInput,
  AdminPublicSupportStatusResponse,
  AdminPublicSupportTicketResponse,
  AdminPublicSupportTicketsResponse,
} from './adminPublicSupport.types';

export const adminPublicSupportApi = {
  /**
   * GET /api/admin/public-support/tickets
   * Listar tickets de visitantes com filtro por status e paginação.
   */
  listTickets: (params?: AdminPublicSupportQuery) => {
    const statusParam = params?.status === 'all' ? undefined : params?.status;
    return api.get<AdminPublicSupportTicketsResponse>('/admin/public-support/tickets', {
      params: { status: statusParam, page: params?.page, limit: params?.limit },
    });
  },

  /**
   * GET /api/admin/public-support/ticket/:id
   * Obter detalhes e mensagens do ticket do visitante.
   */
  getTicket: (ticketId: number) =>
    api.get<AdminPublicSupportTicketResponse>(`/admin/public-support/ticket/${ticketId}`),

  /**
   * POST /api/admin/public-support/ticket/:id/message
   * Responder ao ticket do visitante.
   */
  replyTicket: (ticketId: number, body: AdminPublicSupportReplyInput) =>
    api.post<AdminPublicSupportReplyResponse>(
      `/admin/public-support/ticket/${ticketId}/message`,
      body
    ),

  /**
   * PATCH /api/admin/public-support/ticket/:id/status
   * Alterar status do ticket (open ou closed).
   */
  setStatus: (ticketId: number, status: 'open' | 'closed') =>
    api.patch<AdminPublicSupportStatusResponse>(
      `/admin/public-support/ticket/${ticketId}/status`,
      { status } satisfies AdminPublicSupportStatusInput
    ),
};
