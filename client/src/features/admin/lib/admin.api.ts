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
  AdminProfileResponse,
  AdminProfileUser,
  AdminUserItem,
  AdminSessionItem,
  AdminAuditLogRow,
  AdminAuditListResponse,
  AdminAuditStatsResponse,
  AdminBroadcastMessage,
  AdminBroadcastForm,
  AdminBroadcastListResponse,
  AdminBroadcastMutationResponse,
  AdminBroadcastResetViewsResponse,
  AdminBackupsListResponse,
  AdminBackupCreateResponse,
  AdminBackupVerifyResponse,
  GoogleDriveStatusResponse,
  GoogleDriveAuthUrlResponse,
  GoogleDriveConnectResponse,
  GoogleDriveUploadResponse,
  AdminSystemLogItem,
  AdminSystemLogsResponse,
  AdminSystemLogsQueryParams,
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

/** GET /admin/wallet/withdrawals/pending — server: wallet.admin.routes.ts -> withdrawal.controller.ts adminListPendingWithdrawals. Returns { ok, withdrawals }. */
export function listPendingWithdrawals() {
  return api.get('/admin/wallet/withdrawals/pending');
}

/** POST /admin/wallet/withdrawals/:id/approve — server: withdrawal.controller.ts adminApproveWithdrawal. 409 if the row already left "pending" (raced by another admin action). */
export function approveWithdrawal(id: number | string) {
  return api.post(`/admin/wallet/withdrawals/${id}/approve`);
}

/** POST /admin/wallet/withdrawals/:id/reject — server: withdrawal.controller.ts adminRejectWithdrawal. Refunds the reserved balance; writes status "rejected". 409 on a lost race. */
export function rejectWithdrawal(id: number | string) {
  return api.post(`/admin/wallet/withdrawals/${id}/reject`);
}

/** POST /admin/wallet/withdrawals/:id/complete — server: withdrawal.controller.ts adminCompleteWithdrawal. Requires a valid 0x+64hex txHash. 409 on a lost race. */
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
  return api.get<{ ok: boolean; admins: AdminUserItem[] }>('/admin/admins');
}

export function createAdminUser(data: {
  name: string;
  email: string;
  password: string;
  role: string;
  permissions?: string[];
}) {
  return api.post<{ ok: boolean; admin: AdminUserItem }>('/admin/admins', data);
}

export function updateAdminUser(
  id: number,
  data: { name?: string; role?: string; isActive?: boolean; permissions?: string[] }
) {
  return api.patch<{ ok: boolean; admin: AdminUserItem }>(`/admin/admins/${id}`, data);
}

export function resetAdminUserPassword(id: number, newPassword: string) {
  return api.post<{ ok: boolean; message?: string }>(`/admin/admins/${id}/reset-password`, { newPassword });
}

export function getAdminUserSessions(id: number) {
  return api.get<{ ok: boolean; sessions: AdminSessionItem[] }>(`/admin/admins/${id}/sessions`);
}

export function revokeAdminUserSessions(id: number) {
  return api.delete<{ ok: boolean; revokedCount: number }>(`/admin/admins/${id}/sessions`);
}

export function getAdminProfile() {
  return api.get<AdminProfileResponse>('/admin/profile');
}

export function updateAdminProfile(name: string) {
  return api.patch<{ ok: boolean; admin: AdminProfileUser; message: string }>('/admin/profile', { name });
}

export function changeAdminOwnPassword(data: { currentPassword?: string; newPassword: string }) {
  return api.post<{ ok: boolean; message: string }>('/admin/change-password', data);
}

export function getAdminSessions() {
  return api.get<{ ok: boolean; sessions: AdminSessionItem[]; currentSessionId: string }>('/admin/sessions');
}

export function revokeAdminSession(sessionId: string) {
  return api.delete<{ ok: boolean }>(`/admin/sessions/${sessionId}`);
}

export function revokeOtherAdminSessions() {
  return api.delete<{ ok: boolean; revokedCount: number; message: string }>('/admin/sessions/other');
}

export function getMyAdminAuditLogs(params?: { page?: number; pageSize?: number }) {
  return api.get<{ ok: boolean; rows: AdminAuditLogRow[]; total: number; page: number; pageSize: number; totalPages: number }>(
    '/admin/my-audit',
    { params }
  );
}

export function getAdminAuditLogs(params?: {
  page?: number;
  pageSize?: number;
  adminId?: number;
  action?: string;
  module?: string;
  search?: string;
  success?: boolean;
  from?: string;
  to?: string;
}) {
  return api.get<AdminAuditListResponse>('/admin/admin-audit', { params });
}

export function getAdminAuditStats() {
  return api.get<AdminAuditStatsResponse>('/admin/admin-audit/stats');
}

// ─── Broadcast Notifications ──────────────────────────────────────────────
export function getAdminBroadcasts() {
  return api.get<AdminBroadcastListResponse>('/admin/broadcast');
}

export function createAdminBroadcast(data: Partial<AdminBroadcastForm>) {
  return api.post<AdminBroadcastMutationResponse>('/admin/broadcast', data);
}

export function updateAdminBroadcast(id: number, data: Partial<AdminBroadcastForm>) {
  return api.patch<AdminBroadcastMutationResponse>(`/admin/broadcast/${id}`, data);
}

export function deleteAdminBroadcast(id: number) {
  return api.delete<{ ok: boolean }>(`/admin/broadcast/${id}`);
}

export function resetAdminBroadcastViews(id: number) {
  return api.post<AdminBroadcastResetViewsResponse>(`/admin/broadcast/${id}/reset-views`);
}

export function uploadAdminBroadcastImage(formData: FormData) {
  return api.post<{ ok: boolean; url?: string; message?: string }>('/admin/broadcast/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// ─── Database Backups & Cloud Sync ───────────────────────────────────────
export function getAdminBackups() {
  return api.get<AdminBackupsListResponse>('/admin/backups');
}

export function createAdminBackup() {
  return api.post<AdminBackupCreateResponse>('/admin/backups');
}

export function deleteAdminBackup(filename: string) {
  return api.delete<{ ok: boolean; message?: string }>('/admin/backups', { data: { filename } });
}

export function verifyAdminBackup(filename: string) {
  return api.post<AdminBackupVerifyResponse>('/admin/backups/verify', { filename });
}

export function getAdminGoogleDriveStatus() {
  return api.get<GoogleDriveStatusResponse>('/admin/backups/gdrive/status');
}

export function getAdminGoogleDriveAuthUrl() {
  return api.post<GoogleDriveAuthUrlResponse>('/admin/backups/gdrive/auth-url');
}

export function configureAdminGoogleDrive(data: { clientId: string; clientSecret: string; redirectUri?: string }) {
  return api.post<{ ok: boolean; message: string }>('/admin/backups/gdrive/configure', data);
}

export function connectAdminGoogleDrive(code: string) {
  return api.post<GoogleDriveConnectResponse>('/admin/backups/gdrive/connect', { code });
}

export function uploadAdminBackupToGoogleDrive(filename: string) {
  return api.post<GoogleDriveUploadResponse>('/admin/backups/upload-gdrive', { filename });
}

// ─── System Logs (AuditLog) ───────────────────────────────────────────────
export function getAdminSystemLogs(params?: AdminSystemLogsQueryParams) {
  return api.get<AdminSystemLogsResponse>('/admin/logs', { params });
}

export function getAdminSystemLogById(id: number) {
  return api.get<{ ok: boolean; data: AdminSystemLogItem }>(`/admin/logs/${id}`);
}



