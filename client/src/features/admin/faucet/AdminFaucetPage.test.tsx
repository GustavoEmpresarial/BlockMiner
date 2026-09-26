import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminFaucetPage from './AdminFaucetPage';

const mockFetchAdminFaucetConfig = vi.fn();
const mockSaveAdminFaucetConfig = vi.fn();

vi.mock('./adminFaucet.api', () => ({
  fetchAdminFaucetConfig: () => mockFetchAdminFaucetConfig(),
  saveAdminFaucetConfig: (body: unknown) => mockSaveAdminFaucetConfig(body),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const sampleReward = {
  rewardId: 1,
  cooldownMs: 3600000, // 1 hora
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AdminFaucetPage — UI do Painel Administrativo da Faucet', () => {
  it('renderiza o cabeçalho e carrega a configuração inicial da Faucet', async () => {
    mockFetchAdminFaucetConfig.mockResolvedValueOnce({
      ok: true,
      configured: true,
      reward: sampleReward,
    });

    render(<AdminFaucetPage />);

    expect(screen.getByText(/carregando configuração da faucet/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/configuração da faucet/i).length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue('30')).toBeInTheDocument();
      expect(screen.getByText(/Pulse Mini v1/)).toBeInTheDocument();
    });
  });

  it('exibe o card de pré-visualização sincronizado com os dados', async () => {
    mockFetchAdminFaucetConfig.mockResolvedValueOnce({
      ok: true,
      configured: true,
      reward: sampleReward,
    });

    render(<AdminFaucetPage />);

    await waitFor(() => {
      expect(screen.getByText(/pré-visualização do jogador/i)).toBeInTheDocument();
      expect(screen.getAllByText(/\+30/).length).toBeGreaterThan(0);
      expect(screen.getByText('1h')).toBeInTheDocument();
      expect(screen.getByText('Ativa', { selector: 'span' })).toBeInTheDocument();
    });
  });

  it('permite alterar o cooldown via botões de preset rápido', async () => {
    mockFetchAdminFaucetConfig.mockResolvedValueOnce({
      ok: true,
      configured: true,
      reward: sampleReward,
    });

    render(<AdminFaucetPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('3600000')).toBeInTheDocument();
    });

    // Clica no preset de 30 min (1800000 ms)
    const preset30m = screen.getByRole('button', { name: /30 min/i });
    await userEvent.click(preset30m);

    expect(screen.getByDisplayValue('1800000')).toBeInTheDocument();
  });

  it('envia os dados atualizados ao submeter o formulário com sucesso', async () => {
    mockFetchAdminFaucetConfig.mockResolvedValueOnce({
      ok: true,
      configured: true,
      reward: sampleReward,
    });

    const updatedReward = {
      ...sampleReward,
      cooldownMs: 7200000,
      miner: {
        ...sampleReward.miner,
        baseHashRate: 45,
      },
    };

    mockSaveAdminFaucetConfig.mockResolvedValueOnce({
      ok: true,
      message: 'Configuração da faucet salva.',
      reward: updatedReward,
    });

    render(<AdminFaucetPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    });

    const hashRateInput = screen.getByDisplayValue('30');
    await userEvent.clear(hashRateInput);
    await userEvent.type(hashRateInput, '45');

    const saveButton = screen.getByRole('button', { name: /salvar configuração/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSaveAdminFaucetConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          baseHashRate: 45,
        })
      );
    });
  });

  it('exibe alerta de erro quando a API falha ao carregar', async () => {
    mockFetchAdminFaucetConfig.mockResolvedValueOnce({
      ok: false,
      message: 'Falha ao comunicar com o servidor.',
    });

    render(<AdminFaucetPage />);

    await waitFor(() => {
      expect(screen.getByText('Falha ao comunicar com o servidor.')).toBeInTheDocument();
      expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    });
  });
});
