import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotWalletStatusPanel } from './HotWalletStatusPanel';
import type { AdminHotWalletStatus } from '../adminFinance.types';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockStatusLive: AdminHotWalletStatus = {
  configured: true,
  autoSendEnabled: true,
  globalPause: false,
  viaCoinEx: false,
  address: '0x1234567890abcdef1234567890abcdef12345678',
  balancePol: 25.5,
  minReservePol: 0.1,
  cooldownMs: 0,
  pendingApprovedCount: 3,
  pendingApprovedPol: 8.25,
  canCoverPending: true,
};

const mockStatusPaused: AdminHotWalletStatus = {
  ...mockStatusLive,
  globalPause: true,
};

const mockStatusLowBalance: AdminHotWalletStatus = {
  ...mockStatusLive,
  balancePol: 0.05,
  canCoverPending: false,
};

const mockStatusCooldown: AdminHotWalletStatus = {
  ...mockStatusLive,
  cooldownMs: 900000, // 15 min
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('HotWalletStatusPanel — Componente de Monitoramento da Hot Wallet', () => {
  it('não renderiza nada se o status for null', () => {
    const { container } = render(
      <HotWalletStatusPanel status={null} loading={false} onRefresh={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o painel ativo com saldo, endereço e badge verde de Auto-Send Ativo', () => {
    render(
      <HotWalletStatusPanel status={mockStatusLive} loading={false} onRefresh={vi.fn()} />
    );

    expect(screen.getByText('Hot Wallet & Envio Automático')).toBeInTheDocument();
    expect(screen.getByText('Auto-Send Ativo')).toBeInTheDocument();
    expect(screen.getByText('25.5000')).toBeInTheDocument();
    expect(screen.getByText('saque(s)')).toBeInTheDocument();
    expect(screen.getByText('(8.25 POL)')).toBeInTheDocument();
    expect(screen.getByText(/Saldo suficiente para a fila/i)).toBeInTheDocument();
    expect(screen.getByText('Hot Wallet Direta (Polygon)')).toBeInTheDocument();
  });

  it('exibe badge e alerta vermelho quando o kill switch de pausa global está ativo', () => {
    render(
      <HotWalletStatusPanel status={mockStatusPaused} loading={false} onRefresh={vi.fn()} />
    );

    expect(screen.getByText('Pausado Globalmente (Kill Switch)')).toBeInTheDocument();
    expect(screen.getByText('Envio Automático Pausado')).toBeInTheDocument();
    expect(screen.getByText(/WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE=true/)).toBeInTheDocument();
  });

  it('exibe alerta de saldo insuficiente quando canCoverPending for falso', () => {
    render(
      <HotWalletStatusPanel status={mockStatusLowBalance} loading={false} onRefresh={vi.fn()} />
    );

    expect(screen.getByText('Saldo Insuficiente para Cobrir a Fila')).toBeInTheDocument();
    expect(screen.getByText('0.0500')).toBeInTheDocument();
  });

  it('exibe badge de cooldown com contagem de minutos quando em cooldown', () => {
    render(
      <HotWalletStatusPanel status={mockStatusCooldown} loading={false} onRefresh={vi.fn()} />
    );

    expect(screen.getByText(/Cooldown \(15m restante\)/)).toBeInTheDocument();
  });

  it('chama onRefresh ao clicar no botão de atualizar', async () => {
    const onRefresh = vi.fn();
    render(
      <HotWalletStatusPanel status={mockStatusLive} loading={false} onRefresh={onRefresh} />
    );

    const refreshButton = screen.getByTitle('Atualizar status da Hot Wallet');
    await userEvent.click(refreshButton);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
