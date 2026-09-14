import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import ShopPage from '../ShopPage';
import * as catalogHook from '../hooks/useShopCatalog';

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

afterEach(() => cleanup());

describe('ShopPage', () => {
  it('renders loading state when catalog is loading', () => {
    vi.spyOn(catalogHook, 'useShopCatalog').mockReturnValue({
      miners: [],
      fans: [],
      racks: [],
      shopCurrency: 'BLK',
      fanSalesAvailableAt: null,
      rackSalesAvailableAt: null,
      loading: true,
      reload: vi.fn(),
    });

    renderWithI18n(<ShopPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders all sections when data is loaded', () => {
    vi.spyOn(catalogHook, 'useShopCatalog').mockReturnValue({
      miners: [
        {
          id: 1,
          name: 'Antminer S19 XP',
          baseHashRate: 140000,
          price: 500,
          currency: 'BLK',
        },
      ],
      fans: [
        {
          sku: 'fan-test-1',
          nameKey: 'fans.cooling_system_name',
          descriptionKey: 'fans.cooling_system_desc',
          price: 25,
          currency: 'BLK',
          isPurchaseLive: true,
        },
      ],
      racks: [
        {
          sku: 'rack-test-1',
          nameKey: 'racks.mining_rack_name',
          descriptionKey: 'racks.mining_rack_desc',
          price: 75,
          currency: 'BLK',
          isPurchaseLive: true,
        },
      ],
      shopCurrency: 'BLK',
      fanSalesAvailableAt: null,
      rackSalesAvailableAt: null,
      loading: false,
      reload: vi.fn(),
    });

    renderWithI18n(<ShopPage />);

    // Page title and subtitle
    expect(screen.getByRole('heading', { name: 'Expanda sua Operação' })).toBeInTheDocument();

    // Racks section
    expect(screen.getByRole('heading', { name: 'Racks' })).toBeInTheDocument();

    // Fans section
    expect(screen.getByRole('heading', { name: 'Refrigeração' })).toBeInTheDocument();

    // Miners section
    expect(screen.getByRole('heading', { name: 'Mineradoras' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Antminer S19 XP' })).toBeInTheDocument();

    // Open purchase modal when clicking miner buy button
    const buyButtons = screen.getAllByRole('button', { name: /comprar/i });
    expect(buyButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(buyButtons[buyButtons.length - 1]); // click miner buy
    expect(screen.getByText(/Confirmar compra/i)).toBeInTheDocument();
  });

  it('renders empty state when miners list is empty', () => {
    vi.spyOn(catalogHook, 'useShopCatalog').mockReturnValue({
      miners: [],
      fans: [],
      racks: [],
      shopCurrency: 'BLK',
      fanSalesAvailableAt: null,
      rackSalesAvailableAt: null,
      loading: false,
      reload: vi.fn(),
    });

    renderWithI18n(<ShopPage />);
    expect(screen.getByText(/Nenhum equipamento disponível/i)).toBeInTheDocument();
  });
});
