import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  get: vi.fn(),
  put: vi.fn(),
};

vi.mock('../../../shared/auth/auth.store', () => ({ api }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminFaucet.api — comunicação client ↔ server do faucet admin', () => {
  it('fetchAdminFaucetConfig chama GET /admin/faucet/config e retorna reward configurado', async () => {
    const mockReward = {
      rewardId: 1,
      cooldownMs: 3600000,
      isActive: true,
      miner: {
        id: 38,
        slug: 'faucet-micro-miner',
        name: 'Pulse Mini v1',
        baseHashRate: 30,
        slotSize: 1,
        imageUrl: '/media/miners/reward2.webp',
      },
    };

    api.get.mockResolvedValueOnce({
      data: {
        ok: true,
        configured: true,
        reward: mockReward,
      },
    });

    const { fetchAdminFaucetConfig } = await import('./adminFaucet.api');
    const result = await fetchAdminFaucetConfig();

    expect(api.get).toHaveBeenCalledWith('/admin/faucet/config');
    expect(result.ok).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.reward).toEqual(mockReward);
  });

  it('fetchAdminFaucetConfig trata erro 403 / 500 da API com mensagem amigável', async () => {
    api.get.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { message: 'Acesso negado: sem permissão faucet.view' },
      },
    });

    const { fetchAdminFaucetConfig } = await import('./adminFaucet.api');
    const result = await fetchAdminFaucetConfig();

    expect(result.ok).toBe(false);
    expect(result.reward).toBeNull();
    expect(result.message).toContain('Acesso negado');
  });

  it('saveAdminFaucetConfig chama PUT /admin/faucet/config com payload estruturado', async () => {
    const updateInput = {
      name: 'Pulse Mini v2',
      baseHashRate: 40,
      imageUrl: '/media/miners/reward2.webp',
      cooldownMs: 1800000,
      isActive: true,
    };

    const mockReward = {
      rewardId: 1,
      cooldownMs: 1800000,
      isActive: true,
      miner: {
        id: 38,
        slug: 'faucet-micro-miner',
        name: 'Pulse Mini v2',
        baseHashRate: 40,
        slotSize: 1,
        imageUrl: '/media/miners/reward2.webp',
      },
    };

    api.put.mockResolvedValueOnce({
      data: {
        ok: true,
        message: 'Configuração da faucet atualizada com sucesso.',
        reward: mockReward,
      },
    });

    const { saveAdminFaucetConfig } = await import('./adminFaucet.api');
    const result = await saveAdminFaucetConfig(updateInput);

    expect(api.put).toHaveBeenCalledWith('/admin/faucet/config', updateInput);
    expect(result.ok).toBe(true);
    expect(result.reward?.miner.name).toBe('Pulse Mini v2');
    expect(result.reward?.miner.baseHashRate).toBe(40);
  });

  it('saveAdminFaucetConfig trata erro de validação 400 retornado pelo backend', async () => {
    api.put.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          ok: false,
          code: 'FAUCET_VALIDATION_ERROR',
          message: 'Intervalo mínimo de 1 minuto (60.000 ms).',
        },
      },
    });

    const { saveAdminFaucetConfig } = await import('./adminFaucet.api');
    const result = await saveAdminFaucetConfig({ cooldownMs: 1000 });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Intervalo mínimo');
  });
});
