import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import TrackedWalletsTab from '../components/TrackedWalletsTab';
import { api } from '../../../../shared/auth/auth.store';

afterEach(() => cleanup());

const MOCK_WALLETS = [
  {
    id: 1,
    label: 'Carteira Principal de Saques',
    address: '0x1ca03755c5132e238ae4e0f50d4929ea0d58b897',
    chain: 'polygon',
    assetSymbol: 'POL',
    explorerBaseUrl: 'https://polygonscan.com/address',
    isActive: true,
    isPublic: true,
    includeInTotals: true,
    displayMode: 'total_received',
    sortOrder: 0,
    manualUsdValue: null,
  },
  {
    id: 2,
    label: 'Reserva Fria Externa',
    address: '0x404cbec8ec6f59e28c5f3d9e5b6080da344792e7',
    chain: 'polygon',
    assetSymbol: 'POL',
    explorerBaseUrl: 'https://polygonscan.com/address',
    isActive: true,
    isPublic: true,
    includeInTotals: true,
    displayMode: 'manual_only',
    sortOrder: 1,
    manualUsdValue: 1500.0,
    manualValueNote: 'Armazenado em cold wallet',
  },
];

describe('TrackedWalletsTab', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url === '/admin/transparency/tracked-wallets') {
        return { data: { ok: true, wallets: MOCK_WALLETS } } as any;
      }
      if (url === '/admin/transparency/wallet/settings') {
        return { data: { ok: true, address: '0x1ca03755c5132e238ae4e0f50d4929ea0d58b897' } } as any;
      }
      return { data: { ok: true } } as any;
    });
  });

  it('loads and renders the main Polygon wallet address setting', async () => {
    render(<TrackedWalletsTab />);

    await waitFor(() => {
      const input = screen.getByDisplayValue('0x1ca03755c5132e238ae4e0f50d4929ea0d58b897');
      expect(input).toBeInTheDocument();
    });
    expect(screen.getByText(/Carteira Polygon Principal/i)).toBeInTheDocument();
  });

  it('renders tracked wallets table with labels and manual values', async () => {
    render(<TrackedWalletsTab />);

    await waitFor(() => {
      expect(screen.getByText('Carteira Principal de Saques')).toBeInTheDocument();
      expect(screen.getByText('Reserva Fria Externa')).toBeInTheDocument();
      expect(screen.getByText('$1500.00')).toBeInTheDocument();
    });
  });

  it('opens "+ Adicionar Carteira" modal on click', async () => {
    render(<TrackedWalletsTab />);

    await waitFor(() => {
      expect(screen.getByText('Carteiras da Tesouraria Rastreadas')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /Adicionar Carteira/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Adicionar Carteira à Tesouraria')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: Tesouraria Reserva POL #2')).toBeInTheDocument();
  });
});
