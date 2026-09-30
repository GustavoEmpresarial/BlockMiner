import { api } from '../../../shared/auth/auth.store';
import type {
  AdminHotWalletStatus,
  AdminWithdrawalRow,
} from './adminFinance.types';

export const adminFinanceApi = {
  /**
   * GET /api/admin/wallet/hot-wallet
   * Obter saldo ao vivo, cobertura da fila e status do auto-send.
   */
  getHotWalletStatus: () =>
    api.get<{ ok: boolean; hotWallet: AdminHotWalletStatus }>(
      '/admin/wallet/hot-wallet',
    ),

  /**
   * POST /api/admin/wallet/hot-wallet/clear-cooldown
   * Limpar flag de cooldown de saldo insuficiente para retomar auto-send.
   */
  clearHotWalletCooldown: () =>
    api.post<{
      ok: boolean;
      message: string;
      hotWallet: AdminHotWalletStatus;
    }>('/admin/wallet/hot-wallet/clear-cooldown'),

  /**
   * GET /api/admin/wallet/withdrawals/pending
   * Listar fila ativa (pendente, aprovado, processando) e histórico recente.
   */
  listWithdrawals: () =>
    api.get<{ ok: boolean; withdrawals: AdminWithdrawalRow[] }>(
      '/admin/wallet/withdrawals/pending',
    ),

  /**
   * POST /api/admin/wallet/withdrawals/:id/approve
   * Aprovar saque para envio automático via auto-send.
   */
  approveWithdrawal: (id: number | string) =>
    api.post<{ ok: boolean; message: string }>(
      `/admin/wallet/withdrawals/${id}/approve`,
    ),

  /**
   * POST /api/admin/wallet/withdrawals/:id/reject
   * Rejeitar saque e estornar saldo (POL ou SHIB) para o usuário.
   */
  rejectWithdrawal: (id: number | string) =>
    api.post<{ ok: boolean; message: string }>(
      `/admin/wallet/withdrawals/${id}/reject`,
    ),

  /**
   * POST /api/admin/wallet/withdrawals/:id/complete
   * Concluir saque informando txHash on-chain manualmente.
   */
  completeWithdrawal: (id: number | string, txHash: string) =>
    api.post<{ ok: boolean; message: string }>(
      `/admin/wallet/withdrawals/${id}/complete`,
      { txHash },
    ),
};
