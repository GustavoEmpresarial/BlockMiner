import { api } from '../../../shared/auth/auth.store';
import type {
  AdminAuthCheckResponse,
  AdminPublicSupportReplyResponse,
  AdminPublicSupportStatusFilter,
  AdminPublicSupportTicketResponse,
  AdminPublicSupportTicketsResponse,
  AdminSupportAttachment,
  AdminSupportCreditPolResponse,
  AdminSupportListApiResponse,
  AdminSupportMessageApiResponse,
  AdminSupportPlayerDossierBundle,
  AdminSupportPlayerDossierParams,
  AdminSupportReplyPostResponse,
  AdminSupportUploadImageResponse,
} from './admin.types';

export type {
  AdminSupportDossierPaged,
  AdminSupportPlayerDossierBundle,
  AdminSupportPlayerDossierParams,
} from './admin.types';

/** Validates `admin_session` with the server (same contract as legacy inline call). */
export async function fetchAdminAuthOk(): Promise<boolean> {
  try {
    const res = await api.get<AdminAuthCheckResponse>('/admin/auth/check');
    return Boolean(res.data?.ok);
  } catch {
    return false;
  }
}

/** Safe `response.data.message` from an axios-like error object (no `any`). */
export function readAxiosResponseMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const response = 'response' in err ? (err as { response?: unknown }).response : undefined;
  if (typeof response !== 'object' || response === null) return undefined;
  const data = 'data' in response ? (response as { data?: unknown }).data : undefined;
  if (typeof data !== 'object' || data === null) return undefined;
  const message = 'message' in data ? (data as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : undefined;
}

export function listAdminSupportMessages(params: { page?: number; limit?: number; userId?: number; archived?: boolean }) {
  const query: Record<string, string | number> = {};
  if (params.page != null) query.page = params.page;
  if (params.limit != null) query.limit = params.limit;
  if (params.userId != null) query.userId = params.userId;
  if (params.archived) query.archived = '1';
  return api.get<AdminSupportListApiResponse>('/admin/support', { params: query });
}

export function getAdminSupportMessage(ticketId: number) {
  return api.get<AdminSupportMessageApiResponse>(`/admin/support/${ticketId}`);
}

export function replyAdminSupportMessage(
  ticketId: number,
  body: { reply: string; attachments?: AdminSupportAttachment[] },
) {
  return api.post<AdminSupportReplyPostResponse>(`/admin/support/${ticketId}/reply`, body);
}

export function fetchAdminSupportPlayerDossier(ticketId: number, params: AdminSupportPlayerDossierParams) {
  return api.get<AdminSupportPlayerDossierBundle>(`/admin/support/${ticketId}/player-dossier`, { params });
}

export function creditAdminSupportPol(ticketId: number, body: { amount: number; reason: string }) {
  return api.post<AdminSupportCreditPolResponse>(`/admin/support/${ticketId}/credit-pol`, body);
}

export function uploadAdminSupportImage(file: File) {
  const fd = new FormData();
  fd.append('image', file);
  return api.post<AdminSupportUploadImageResponse>('/admin/upload-image', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function listAdminPublicSupportTickets(params: { status: AdminPublicSupportStatusFilter; page: number }) {
  const status = params.status === 'all' ? undefined : params.status;
  return api.get<AdminPublicSupportTicketsResponse>('/admin/public-support/tickets', {
    params: { status, page: params.page },
  });
}

export function getAdminPublicSupportTicket(ticketId: number) {
  return api.get<AdminPublicSupportTicketResponse>(`/admin/public-support/ticket/${ticketId}`);
}

export function replyAdminPublicSupportTicket(ticketId: number, body: { message: string; imageUrl?: string | null }) {
  return api.post<AdminPublicSupportReplyResponse>(`/admin/public-support/ticket/${ticketId}/message`, body);
}

export function setAdminPublicSupportTicketStatus(ticketId: number, status: 'open' | 'closed') {
  return api.patch<{ ok?: boolean }>(`/admin/public-support/ticket/${ticketId}/status`, { status });
}

/** GET /admin/client-errors */
export function listAdminClientErrors(limit = 500) {
  return api.get<{ ok: boolean; items?: import('../client-errors/adminClientErrors.types').ClientErrorRow[]; message?: string }>(
    '/admin/client-errors',
    { params: { limit } },
  );
}

export function clearAdminClientErrors() {
  return api.delete<{ ok: boolean; deleted?: number; message?: string }>('/admin/client-errors');
}

export type AdminAiHealthMetrics = {
  economy: Record<string, unknown>;
  freeChannels: Record<string, unknown>;
  platform: Record<string, unknown>;
  spenders: Record<string, unknown>;
};

export function analyzeAdminAiHealth() {
  return api.post<{ ok: boolean; metrics?: AdminAiHealthMetrics; report?: string; message?: string }>(
    '/admin/ai-health/analyze',
    undefined,
    { timeout: 120_000 },
  );
}

export function listAdminFraudSignals(params: { scope: string; page: number; limit: number }) {
  return api.get('/admin/fraud-signals', { params });
}

export function refreshAdminFraudIp(ip: string) {
  return api.post('/admin/fraud-signals/refresh-ip', { ip, forceRefresh: true });
}

export function listAdminUsers(params: {
  page?: number;
  pageSize?: number;
  query?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const q: Record<string, string | number> = { pageSize: params.pageSize ?? 25 };
  if (params.page != null) q.page = params.page;
  if (params.query?.trim()) q.query = params.query.trim();
  if (params.fromDate) q.fromDate = params.fromDate;
  if (params.toDate) q.toDate = params.toDate;
  return api.get('/admin/users', { params: q });
}

export function getAdminUser(id: number | string) {
  return api.get(`/admin/users/${id}`);
}

export function listPendingWithdrawals() {
  return api.get('/admin/wallet/withdrawals/pending');
}

export function approveWithdrawal(id: number | string) {
  return api.post(`/admin/wallet/withdrawals/${id}/approve`);
}

export function rejectWithdrawal(id: number | string) {
  return api.post(`/admin/wallet/withdrawals/${id}/reject`);
}

export function completeWithdrawal(id: number | string, txHash: string) {
  return api.post(`/admin/wallet/withdrawals/${id}/complete`, { txHash });
}

export function fetchAdminDashboardStats() {
  return api.get('/admin/stats');
}

export function fetchAdminOpsSnapshot() {
  return api.get('/admin/ops/snapshot');
}

export function fetchAdminServerMetrics() {
  return api.get('/admin/ops/server-metrics');
}

export const adminOfferEventsApi = {
  list: () => api.get('/admin/offer-events'),
  remove: (id: number) => api.delete(`/admin/offer-events/${id}`),
};

export const adminInternalOfferwallApi = {
  offers: () => api.get('/admin/internal-offerwall/offers'),
  attempts: (params?: { status?: string; offerId?: string; limit?: number }) =>
    api.get('/admin/internal-offerwall/attempts', { params }),
};

export function getAdminSidebarNav() {
  return api.get('/admin/sidebar-nav');
}

export function putAdminSidebarNav(entries: unknown) {
  return api.put('/admin/sidebar-nav', { entries });
}

export function getAdminFaucetConfig() {
  return api.get('/admin/faucet/config');
}

export function putAdminFaucetConfig(body: unknown) {
  return api.put('/admin/faucet/config', body);
}

export function listAdminCheckinMilestones() {
  return api.get('/admin/checkin-milestones');
}

export function listAdmins() {
  return api.get('/admin/admins');
}
