/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import AdminFinancePage from './AdminFinancePage';
import { adminFinanceApi } from './adminFinance.api';
import type { AdminHotWalletStatus, AdminWithdrawalRow } from './adminFinance.types';

const MOCK_HOT_WALLET: AdminHotWalletStatus = {
  configured: true,
  autoSendEnabled: true,
  globalPause: false,
  viaCoinEx: false,
  address: '0x1111111111111111111111111111111111111111',
  balancePol: 25.5,
  minReservePol: 0.1,
  cooldownMs: 0,
  pendingApprovedCount: 1,
  pendingApprovedPol: 5.0,
  canCoverPending: true,
};

const MOCK_WITHDRAWALS: AdminWithdrawalRow[] = [
  {
    id: 101,
    userId: 42,
    amount: 5.0,
    address: '0x2222222222222222222222222222222222222222',
    status: 'pending',
    type: 'withdrawal',
    txHash: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    user: {
      name: 'Player One',
      email: 'player1@blockminer.space',
    },
  },
  {
    id: 102,
    userId: 43,
    amount: 10.0,
    address: '0x3333333333333333333333333333333333333333',
    status: 'approved',
    type: 'withdrawal',
    txHash: null,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    user: {
      name: 'Player Two',
      email: 'player2@blockminer.space',
    },
  },
  {
    id: 103,
    userId: 44,
    amount: 50.0,
    address: '0x4444444444444444444444444444444444444444',
    status: 'completed',
    type: 'withdrawal',
    txHash: '0x' + 'a'.repeat(64),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    completedAt: new Date(Date.now() - 80000000).toISOString(),
    user: {
      name: 'Player Three',
      email: 'player3@blockminer.space',
    },
  },
];

describe('AdminFinancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(adminFinanceApi, 'getHotWalletStatus').mockResolvedValue({
      data: { ok: true, hotWallet: MOCK_HOT_WALLET },
    } as never);
    vi.spyOn(adminFinanceApi, 'listWithdrawals').mockResolvedValue({
      data: { ok: true, withdrawals: MOCK_WITHDRAWALS },
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders page header, hot wallet status, and KPI summary', async () => {
    render(<AdminFinancePage />);

    expect(screen.getByText('Gestão Financeira')).toBeInTheDocument();

    await waitFor(() => {
      // KPI cards
      expect(screen.getByText('Fila Ativa')).toBeInTheDocument();
      expect(screen.getByText('POL na Fila')).toBeInTheDocument();
      expect(screen.getByText('Histórico Recente')).toBeInTheDocument();
    });

    // 2 active in queue (101 pending + 102 approved)
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders withdrawal rows in queue and recent history', async () => {
    render(<AdminFinancePage />);

    await waitFor(() => {
      expect(screen.getAllByText('#101').length).toBeGreaterThan(0);
      expect(screen.getAllByText('#102').length).toBeGreaterThan(0);
      expect(screen.getAllByText('#103').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('player1@blockminer.space')).toBeInTheDocument();
    expect(screen.getByText('player2@blockminer.space')).toBeInTheDocument();
    expect(screen.getByText('player3@blockminer.space')).toBeInTheDocument();
  });

  it('filters rows based on search input', async () => {
    render(<AdminFinancePage />);

    await waitFor(() => {
      expect(screen.getAllByText('#101').length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText(/Buscar saque por #ID/i);
    fireEvent.change(searchInput, { target: { value: 'player1' } });

    await waitFor(() => {
      expect(screen.getAllByText('#101').length).toBeGreaterThan(0);
      expect(screen.queryByText('#102')).not.toBeInTheDocument();
    });
  });

  it('triggers approve action when clicking Aprovar', async () => {
    const approveSpy = vi
      .spyOn(adminFinanceApi, 'approveWithdrawal')
      .mockResolvedValue({ data: { ok: true, message: 'Approved' } } as never);

    render(<AdminFinancePage />);

    await waitFor(() => {
      expect(screen.getAllByText('Aprovar').length).toBeGreaterThan(0);
    });

    const approveBtn = screen.getAllByText('Aprovar')[0];
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith(101);
    });
  });

  it('opens reject modal and confirms rejection', async () => {
    const rejectSpy = vi
      .spyOn(adminFinanceApi, 'rejectWithdrawal')
      .mockResolvedValue({ data: { ok: true, message: 'Rejected' } } as never);

    render(<AdminFinancePage />);

    await waitFor(() => {
      expect(screen.getAllByText('Rejeitar').length).toBeGreaterThan(0);
    });

    // Click reject on pending item
    const rejectBtn = screen.getAllByText('Rejeitar')[0];
    fireEvent.click(rejectBtn);

    // Modal appears
    await waitFor(() => {
      expect(screen.getByText('Rejeitar Saque #101')).toBeInTheDocument();
      expect(screen.getByText('Confirmar Rejeição')).toBeInTheDocument();
    });

    // Confirm
    fireEvent.click(screen.getByText('Confirmar Rejeição'));

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith(101);
    });
  });
});
