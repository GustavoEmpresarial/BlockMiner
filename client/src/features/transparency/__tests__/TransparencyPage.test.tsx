import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import Transparency from '../TransparencyPage';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  };
});

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MOCK_ENTRIES_RESPONSE = {
  ok: true,
  entries: [
    {
      id: 1,
      type: 'expense',
      category: 'infrastructure',
      name: 'Hetzner AX52 Dedicated Server',
      provider: 'Hetzner',
      amountUsd: 120,
      currencyCode: 'USD',
      period: 'monthly',
      isOnChain: false,
      isPaid: true,
      isActive: true,
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
    {
      id: 2,
      type: 'income',
      category: 'misc',
      incomeCategory: 'sponsorship',
      name: 'Top Banner Ads',
      provider: 'AdNetwork',
      amountUsd: 500,
      currencyCode: 'USD',
      period: 'monthly',
      isOnChain: false,
      isPaid: true,
      isActive: true,
      updatedAt: '2026-09-20T00:00:00.000Z',
    },
  ],
  asOf: '2026-09-20T00:00:00Z',
};

const MOCK_WALLETS_RESPONSE = {
  ok: true,
  wallets: [
    {
      id: 1,
      label: 'Polygon Treasury',
      address: '0x56a655787f73ffab2cbdb702008adacb60f1c9fc',
      chain: 'polygon',
      assetSymbol: 'USDC',
      isPublic: true,
      isActive: true,
      includeInTotals: true,
      displayMode: 'live',
      valueUsd: 25000,
      totalUsd: 25000,
      fetchedAt: '2026-09-20T00:00:00.000Z',
    },
  ],
  asOf: '2026-09-20T00:00:00Z',
};

const MOCK_EXTERNAL_INVESTMENTS_RESPONSE = {
  ok: true,
  investments: [
    {
      id: 1,
      name: 'Uniswap V3 USDC/WETH LP',
      description: 'Pool de liquidez concentrada em Polygon',
      linkUrl: 'https://app.uniswap.org',
      imageUrl: null,
      amountInvestedUsd: 5000,
      amountWithdrawnUsd: 1200,
      roiForecast: '15-20% a.a.',
      isActive: true,
      sortOrder: 0,
    },
  ],
};

function mockFetchResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => JSON.parse(JSON.stringify(payload)),
  } as Response);
}

describe('TransparencyPage (Public Portal)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/transparency/wallets-live')) {
        return mockFetchResponse(MOCK_WALLETS_RESPONSE);
      }
      if (url.includes('/api/transparency/external-investments')) {
        return mockFetchResponse(MOCK_EXTERNAL_INVESTMENTS_RESPONSE);
      }
      if (url.includes('/api/transparency/hardware-assets')) {
        return mockFetchResponse({ ok: true, assets: [] });
      }
      if (url.includes('/api/transparency/withdrawal-stats')) {
        return mockFetchResponse({ ok: true, stats: { totalWithdrawnUsd: 0 } });
      }
      if (url.endsWith('/api/transparency') || url.includes('/api/transparency?')) {
        return mockFetchResponse(MOCK_ENTRIES_RESPONSE);
      }
      console.log('UNHANDLED FETCH IN TEST:', url);
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
  });

  it('renders summary financial cards and balance', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByText('Custo Mensal')).toBeInTheDocument();
      expect(screen.getByText('Total Receitas')).toBeInTheDocument();
      expect(screen.getByText('Saldo Líquido')).toBeInTheDocument();
      expect(screen.getByText('Tesouraria')).toBeInTheDocument();
    });

    // Monthly expense: $120.00
    expect(screen.getAllByText('$120.00').length).toBeGreaterThanOrEqual(1);
    // Monthly income: $500.00
    expect(screen.getAllByText('$500.00').length).toBeGreaterThanOrEqual(1);
    // Net balance: $380.00
    expect(screen.getAllByText('$380.00').length).toBeGreaterThanOrEqual(1);
  });

  it('renders income and expense categories breakdown', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByText('Top Banner Ads')).toBeInTheDocument();
      expect(screen.getAllByText(/Infraestrutura/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches to external investments tab and loads investments', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByText(/Outros Investimentos/i)).toBeInTheDocument();
    });

    const extTab = screen.getByText(/Outros Investimentos/i);
    fireEvent.click(extTab);

    await waitFor(() => {
      expect(screen.getByText('Uniswap V3 USDC/WETH LP')).toBeInTheDocument();
      expect(screen.getByText('15-20% a.a.')).toBeInTheDocument();
    });
  });
});
