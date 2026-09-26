import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type {
  AdminFaucetConfigInput,
  AdminFaucetConfigResponse,
  AdminFaucetConfigUpdateResponse,
  AdminFaucetRewardDetail,
} from './adminFaucet.types';

export async function fetchAdminFaucetConfig(): Promise<{
  ok: boolean;
  configured: boolean;
  reward: AdminFaucetRewardDetail | null;
  message?: string;
}> {
  try {
    const res = await api.get<AdminFaucetConfigResponse>('/admin/faucet/config');
    if (res.data.ok) {
      return {
        ok: true,
        configured: res.data.configured,
        reward: res.data.reward,
      };
    }
    return { ok: false, configured: false, reward: null, message: 'Falha ao obter configuração.' };
  } catch (err: unknown) {
    return {
      ok: false,
      configured: false,
      reward: null,
      message: readAxiosResponseMessage(err) || 'Falha ao carregar configuração da faucet.',
    };
  }
}

export async function saveAdminFaucetConfig(
  input: AdminFaucetConfigInput,
): Promise<{ ok: boolean; reward?: AdminFaucetRewardDetail; message?: string }> {
  try {
    const res = await api.put<AdminFaucetConfigUpdateResponse>('/admin/faucet/config', input);
    if (res.data.ok && res.data.reward) {
      return { ok: true, reward: res.data.reward, message: res.data.message };
    }
    return { ok: false, message: 'Falha ao atualizar configuração.' };
  } catch (err: unknown) {
    return {
      ok: false,
      message: readAxiosResponseMessage(err) || 'Falha ao salvar configuração da faucet.',
    };
  }
}
