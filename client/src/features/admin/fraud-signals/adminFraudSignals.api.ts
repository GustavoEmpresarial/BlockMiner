import { api } from '../../../shared/auth/auth.store';
import type {
  FraudScope,
  FraudSignalsResponse,
  RefreshIpResponse,
  ResetCollectionResponse,
} from './adminFraudSignals.types';

export const adminFraudSignalsApi = {
  /**
   * GET /api/admin/fraud-signals
   * Listar clusters de sinais de fraude com filtros de escopo, busca e paginação.
   */
  listSignals: (params?: { scope?: FraudScope; page?: number; limit?: number; q?: string }) => {
    const query: Record<string, string | number> = {};
    if (params?.scope && params.scope !== 'all') query.scope = params.scope;
    if (params?.page != null) query.page = params.page;
    if (params?.limit != null) query.limit = params.limit;
    if (params?.q?.trim()) query.q = params.q.trim();
    return api.get<FraudSignalsResponse>('/admin/fraud-signals', { params: query });
  },

  /**
   * POST /api/admin/fraud-signals/refresh-ip
   * Forçar atualização ao vivo de ASN/PTR/Proxy para um IP específico.
   */
  refreshIp: (ip: string, forceRefresh = true) =>
    api.post<RefreshIpResponse>('/admin/fraud-signals/refresh-ip', { ip, forceRefresh }),

  /**
   * POST /api/admin/fraud-signals/reset-collection
   * Limpar toda a base de logs de IP e histórico de coleta anti-fraude.
   */
  resetCollection: (confirm = 'RESET_FRAUD_COLLECTION') =>
    api.post<ResetCollectionResponse>('/admin/fraud-signals/reset-collection', { confirm }),
};
