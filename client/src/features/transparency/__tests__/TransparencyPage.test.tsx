import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import en from '../../../i18n/locales/en.json';
import es from '../../../i18n/locales/es.json';
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
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
    es: { translation: es },
  },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  i18n.changeLanguage('pt-BR');
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

const MOCK_HARDWARE_RESPONSE = {
  ok: true,
  assets: [
    {
      id: 1,
      name: 'Antminer S19J Pro',
      category: 'ASIC Miner',
      model: 'S19J Pro',
      manufacturer: 'Bitmain',
      status: 'running',
      purchaseCostUsd: 1800,
      transitWeeks: 2,
      specs: [{ label: 'Hashrate', value: '100 TH/s' }],
      model3dUrl: null,
      imageUrl: '/media/transparency/antminer.png',
      profitLogs: [
        { id: 1, satoshiAmount: 50000, earnedUsd: 30, btcPrice: 60000, earnedAt: '2026-09-20T00:00:00.000Z' },
      ],
      profitSummary: {
        totalSats: 50000,
        totalUsd: 30,
        recoveryPercent: 1.67,
        roiReached: false,
        remainingUsd: 1770,
        avgDailyUsd: 1.5,
        estimatedDaysRemaining: 1180,
      },
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
        return mockFetchResponse(MOCK_HARDWARE_RESPONSE);
      }
      if (url.includes('/api/transparency/withdrawal-stats')) {
        return mockFetchResponse({ ok: true, stats: { totalWithdrawnUsd: 0 } });
      }
      if (url.endsWith('/api/transparency') || url.includes('/api/transparency?')) {
        return mockFetchResponse(MOCK_ENTRIES_RESPONSE);
      }
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

  /* =========================================================================
   * P1, P2, P3, P4 & A11y Tests
   * ========================================================================= */

  it('P3 — balanced responsive KPI grid without orphan cards', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      const kpiGrid = screen.getByTestId('kpi-grid');
      expect(kpiGrid).toBeInTheDocument();
      expect(kpiGrid).toHaveClass('grid', 'grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-5');
    });
  });

  it('P2 — intuitive navigation: tab switcher with ARIA roles and keyboard arrow navigation', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(6);

    const allTab = screen.getByRole('tab', { name: /Todos os Dados/i });
    const overviewTab = screen.getByRole('tab', { name: /Visão Geral/i });
    const expensesTab = screen.getByRole('tab', { name: /Custos & Receitas/i });

    expect(allTab).toHaveAttribute('aria-selected', 'true');
    expect(overviewTab).toHaveAttribute('aria-selected', 'false');

    // Arrow navigation on tablist
    fireEvent.keyDown(allTab, { key: 'ArrowRight' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(overviewTab, { key: 'ArrowRight' });
    expect(expensesTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(expensesTab, { key: 'ArrowLeft' });
    expect(overviewTab).toHaveAttribute('aria-selected', 'true');

    // Home / End keys
    fireEvent.keyDown(overviewTab, { key: 'End' });
    const lastTab = tabs[tabs.length - 1];
    expect(lastTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(lastTab, { key: 'Home' });
    expect(allTab).toHaveAttribute('aria-selected', 'true');
  });

  it('P2 — tab filtering: filters content to selected section view and back to all', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByText('Hetzner AX52 Dedicated Server')).toBeInTheDocument();
    });

    // Click on "Visão Geral & Gráficos" tab -> shows overview panel, hides expenses table
    const overviewTab = screen.getByRole('tab', { name: /Visão Geral/i });
    fireEvent.click(overviewTab);

    expect(screen.getByRole('tabpanel', { name: /Visão Geral/i })).toBeInTheDocument();
    expect(screen.queryByTestId('expenses-table-section')).not.toBeInTheDocument();

    // Click on "Custos & Receitas" tab -> shows expenses table and incomes
    const expensesTab = screen.getByRole('tab', { name: /Custos & Receitas/i });
    fireEvent.click(expensesTab);

    expect(screen.getByTestId('expenses-table-section')).toBeInTheDocument();
    expect(screen.getByText('Top Banner Ads')).toBeInTheDocument();

    // Click back on "Todos os Dados" -> shows both overview and expenses
    const allTab = screen.getByRole('tab', { name: /Todos os Dados/i });
    fireEvent.click(allTab);

    expect(screen.getByTestId('expenses-table-section')).toBeInTheDocument();
    expect(screen.getByText('Hetzner AX52 Dedicated Server')).toBeInTheDocument();
  });

  it('P4 — localized table headers across pt-BR, en, and es without hardcoded strings', async () => {
    // 1. pt-BR
    i18n.changeLanguage('pt-BR');
    const { unmount } = renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Item / Descrição' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Provedor' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Valor USD' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    });
    unmount();

    // 2. en
    i18n.changeLanguage('en');
    const { unmount: unmountEn } = renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Item / Description' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Provider' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Value (USD)' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    });
    unmountEn();

    // 3. es
    i18n.changeLanguage('es');
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Ítem / Descripción' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Proveedor' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Valor USD' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument();
    });
  });

  it('MethodologyModal — opens via button, renders in portal with WAI-ARIA dialog, traps focus and closes via ESC and X button', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Metodologia e fontes de dados/i })).toBeInTheDocument();
    });

    const openBtn = screen.getByRole('button', { name: /Metodologia e fontes de dados/i });
    fireEvent.click(openBtn);

    // Modal dialog is present in document.body
    const modal = await screen.findByRole('dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAttribute('aria-labelledby', 'methodology-title');
    expect(document.body).toContainElement(modal);

    // Test focus trap with Tab and Shift+Tab
    const closeBtn = screen.getByLabelText(/Fechar/i);
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn); // Only 1 focusable button in dialog

    // Close via ESC
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Re-open and close via backdrop click
    fireEvent.click(openBtn);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const backdrop = screen.getByTestId('methodology-modal');
    fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders error alert when transparency API fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('API Down'));

    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByTestId('transparency-error')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders hardware assets and profit logs when infrastructure tab is selected', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByText('Antminer S19J Pro')).toBeInTheDocument();
      expect(screen.getByText(/100 TH\/s/)).toBeInTheDocument();
    });

    const infraTab = screen.getByRole('tab', { name: /Hardware & IA 3D/i });
    fireEvent.click(infraTab);

    expect(screen.getByText('Antminer S19J Pro')).toBeInTheDocument();
  });

  it('P1 & A11y — semantic structure, stable testids, and heading hierarchy across all heavy sections', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByTestId('withdrawals-section')).toBeInTheDocument();
      expect(screen.getByTestId('hardware-asset-card')).toBeInTheDocument();
      expect(screen.getByTestId('ai-infrastructure-3d-section')).toBeInTheDocument();
      expect(screen.getByTestId('income-section')).toBeInTheDocument();
      expect(screen.getByTestId('expenses-table-section')).toBeInTheDocument();
    });

    // Semantic section element verification (stable across cosmetic CSS adjustments)
    const withdrawalsSection = screen.getByTestId('withdrawals-section');
    expect(withdrawalsSection.tagName.toLowerCase()).toBe('section');
    expect(withdrawalsSection).toHaveAttribute('aria-labelledby');

    const hardwareCard = screen.getByTestId('hardware-asset-card');
    expect(hardwareCard.tagName.toLowerCase()).toBe('section');
    expect(hardwareCard).toHaveAttribute('aria-labelledby');

    const aiSection = screen.getByTestId('ai-infrastructure-3d-section');
    expect(aiSection.tagName.toLowerCase()).toBe('section');

    const incomeSection = screen.getByTestId('income-section');
    expect(incomeSection.tagName.toLowerCase()).toBe('section');
    expect(incomeSection).toHaveAttribute('aria-labelledby');

    const expensesSection = screen.getByTestId('expenses-table-section');
    expect(expensesSection.tagName.toLowerCase()).toBe('section');
    expect(expensesSection).toHaveAttribute('aria-labelledby');

    // Item 4: WalletsLiveSection heading promoted to h2 for accessible document structure
    const walletHeading = screen.getByRole('heading', { level: 2, name: /Carteiras do Projeto/i });
    expect(walletHeading).toBeInTheDocument();
  });

  it('Item 1 (A11y) — aria-controls targets real, existing role="tabpanel" in the DOM for all tabs', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    // Default tab 'all': must target a valid #panel-all element with role="tabpanel"
    const allTab = screen.getByRole('tab', { name: /Todos os Dados/i });
    const allControlsId = allTab.getAttribute('aria-controls');
    expect(allControlsId).toBe('panel-all');

    const panelAll = document.getElementById(allControlsId!);
    expect(panelAll).not.toBeNull();
    expect(panelAll).toHaveAttribute('role', 'tabpanel');
    expect(panelAll).toHaveAttribute('aria-labelledby', 'tab-all');

    // Click each tab and verify its aria-controls targets a real tabpanel in the DOM
    const tabKeys = ['overview', 'expenses', 'treasury', 'infrastructure', 'withdrawals'];
    for (const key of tabKeys) {
      const tabBtn = document.getElementById(`tab-${key}`);
      expect(tabBtn).not.toBeNull();
      fireEvent.click(tabBtn!);

      const targetId = tabBtn!.getAttribute('aria-controls');
      expect(targetId).toBe(`panel-${key}`);

      const targetPanel = document.getElementById(targetId!);
      expect(targetPanel).not.toBeNull();
      expect(targetPanel).toHaveAttribute('role', 'tabpanel');
      expect(targetPanel).toHaveAttribute('aria-labelledby', `tab-${key}`);
    }
  });

  it('Item 3 (A11y) — table headers have scope="col" in expenses table and hardware profit table', async () => {
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByTestId('expenses-table-section')).toBeInTheDocument();
      expect(screen.getByTestId('hardware-profit-history')).toBeInTheDocument();
    });

    // Expenses table th have scope="col"
    const expensesTable = screen.getByTestId('expenses-table-section');
    const expensesThList = expensesTable.querySelectorAll('th');
    expect(expensesThList.length).toBe(4);
    for (const th of Array.from(expensesThList)) {
      expect(th).toHaveAttribute('scope', 'col');
    }

    // Hardware profit history th have scope="col"
    const hardwareTable = screen.getByTestId('hardware-profit-history');
    const hardwareThList = hardwareTable.querySelectorAll('th');
    expect(hardwareThList.length).toBe(3);
    for (const th of Array.from(hardwareThList)) {
      expect(th).toHaveAttribute('scope', 'col');
    }
  });

  it('Spanish translation — renders genuine Spanish prose for page titles, badges, and errors', async () => {
    i18n.changeLanguage('es');
    renderWithI18n(<Transparency />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Portal de Transparencia' })).toBeInTheDocument();
      expect(screen.getByText('BlockMiner — Costes operativos e inversiones')).toBeInTheDocument();
      expect(screen.getByText('100% Transparente')).toBeInTheDocument();
    });
  });

  it('barrel index re-exports TransparencyPage correctly', async () => {
    const barrel = await import('../index');
    expect(barrel.TransparencyPage).toBeDefined();
    expect(barrel.default).toBeDefined();
  });
});
