import { api } from '../../../shared/auth/auth.store';
import type {
  AdminAntibotRecomputeResponse,
  AdminAntibotResetResponse,
  AdminAntibotTrustInput,
  AdminAntibotTrustResponse,
  AdminAntibotUpdateAlertResponse,
  AdminAntibotUserProfile,
  AlertRow,
  DeviceRow,
  EvidenceRow,
  OverviewData,
  SessionRow,
} from './adminAntibot.types';

export interface AntibotListResponse<T> {
  ok: boolean;
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const adminAntibotApi = {
  /**
   * GET /api/admin/antibot/overview
   * Visão geral de métricas, top risco e alertas abertos.
   */
  getOverview: (limit = 20) =>
    api.get<OverviewData>('/admin/antibot/overview', { params: { limit } }),

  /**
   * GET /api/admin/antibot/evidence
   * Listar evidências de detecção com paginação e filtros.
   */
  listEvidence: (params?: Record<string, string | number | undefined>) =>
    api.get<AntibotListResponse<EvidenceRow>>('/admin/antibot/evidence', { params }),

  /**
   * GET /api/admin/antibot/sessions
   * Listar sessões com fingerprints de browser/SO.
   */
  listSessions: (params?: Record<string, string | number | undefined>) =>
    api.get<AntibotListResponse<SessionRow>>('/admin/antibot/sessions', { params }),

  /**
   * GET /api/admin/antibot/devices
   * Listar dispositivos e contagem de contas associadas.
   */
  listDevices: (params?: Record<string, string | number | undefined>) =>
    api.get<AntibotListResponse<DeviceRow>>('/admin/antibot/devices', { params }),

  /**
   * GET /api/admin/antibot/alerts
   * Listar alertas gerados pelo motor de risco.
   */
  listAlerts: (params?: Record<string, string | number | undefined>) =>
    api.get<AntibotListResponse<AlertRow>>('/admin/antibot/alerts', { params }),

  /**
   * PATCH /api/admin/antibot/alerts/:id
   * Atualizar status do alerta (open, acknowledged, resolved).
   */
  updateAlertStatus: (id: number, status: 'open' | 'acknowledged' | 'resolved') =>
    api.patch<AdminAntibotUpdateAlertResponse>(`/admin/antibot/alerts/${id}`, { status }),

  /**
   * GET /api/admin/antibot/users/:id
   * Obter perfil completo de risco, histórico de evidências e sessões do usuário.
   */
  getUserProfile: (userId: number, evidenceLimit = 100) =>
    api.get<AdminAntibotUserProfile>(`/admin/antibot/users/${userId}`, { params: { evidenceLimit } }),

  /**
   * POST /api/admin/antibot/users/:id/trust
   * Definir ou remover o status de usuário confiável (whitelist).
   */
  setTrusted: (userId: number, body: AdminAntibotTrustInput) =>
    api.post<AdminAntibotTrustResponse>(`/admin/antibot/users/${userId}/trust`, body),

  /**
   * POST /api/admin/antibot/users/:id/recompute
   * Forçar recálculo da pontuação de risco do usuário.
   */
  recomputeScore: (userId: number) =>
    api.post<AdminAntibotRecomputeResponse>(`/admin/antibot/users/${userId}/recompute`),

  /**
   * POST /api/admin/antibot/reset
   * Limpar toda a base do antibot (ação destrutiva com auditoria).
   */
  resetAll: () =>
    api.post<AdminAntibotResetResponse>('/admin/antibot/reset'),
};
