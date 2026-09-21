import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import AdminTransparencyExternalInvestmentsPage from '../AdminTransparencyExternalInvestmentsPage';
import { api } from '../../../../shared/auth/auth.store';
import type { ExternalInvestmentRow } from '../components/adminTransparency.types';

vi.mock('../../../../shared/auth/auth.store', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MOCK_INVESTMENTS: ExternalInvestmentRow[] = [
  {
    id: 1,
    name: 'Uniswap V3 USDC/WETH LP',
    description: 'Pool de liquidez concentrada em Polygon',
    linkUrl: 'https://app.uniswap.org',
    imageUrl: 'https://blockminer.space/logos/uniswap.png',
    amountInvestedUsd: 5000,
    amountWithdrawnUsd: 1200,
    roiForecast: '15-20% a.a.',
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 2,
    name: 'Aave V3 Supply Vault',
    description: 'Empréstimo descentralizado de stablecoins',
    linkUrl: 'https://app.aave.com',
    imageUrl: null,
    amountInvestedUsd: 3000,
    amountWithdrawnUsd: 3500,
    roiForecast: '8% a.a.',
    isActive: true,
    sortOrder: 1,
  },
];

describe('AdminTransparencyExternalInvestmentsPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/admin/transparency/external-investments') {
        return Promise.resolve({
          data: { ok: true, investments: MOCK_INVESTMENTS },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  });

  it('renders page header and aggregate financial metrics', async () => {
    render(<AdminTransparencyExternalInvestmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Investimentos Externos')).toBeInTheDocument();
      expect(screen.getByText('Total Investido')).toBeInTheDocument();
      expect(screen.getByText('Total Resgatado')).toBeInTheDocument();
      expect(screen.getByText('Saldo Líquido')).toBeInTheDocument();
      expect(screen.getByText('Plataformas Ativas')).toBeInTheDocument();
    });

    // Total invested: 5000 + 3000 = 8000.00
    expect(screen.getByText('$8000.00')).toBeInTheDocument();
    // Total withdrawn: 1200 + 3500 = 4700.00
    expect(screen.getByText('$4700.00')).toBeInTheDocument();
    // Net balance: 4700 - 8000 = -$3300.00
    expect(screen.getByText('-$3300.00')).toBeInTheDocument();
  });

  it('renders investment cards with progress and links', async () => {
    render(<AdminTransparencyExternalInvestmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Uniswap V3 USDC/WETH LP')).toBeInTheDocument();
      expect(screen.getByText('Aave V3 Supply Vault')).toBeInTheDocument();
      expect(screen.getByText('15-20% a.a.')).toBeInTheDocument();
      expect(screen.getByText('8% a.a.')).toBeInTheDocument();
    });
  });

  it('opens modal to create a new investment when clicking "Novo Investimento"', async () => {
    render(<AdminTransparencyExternalInvestmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Novo Investimento')).toBeInTheDocument();
    });

    const addBtn = screen.getByText('Novo Investimento');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Novo Investimento Externo')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/ex: RollerCoin/i)).toBeInTheDocument();
    });
  });

  it('opens modal pre-filled with investment data when editing', async () => {
    render(<AdminTransparencyExternalInvestmentsPage />);

    await waitFor(() => {
      expect(screen.getByText('Uniswap V3 USDC/WETH LP')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByTitle('Editar');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Editar Investimento Externo')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Uniswap V3 USDC/WETH LP')).toBeInTheDocument();
      expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    });
  });
});
