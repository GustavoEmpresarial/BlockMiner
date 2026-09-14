import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { ShopRackCard } from '../components/ShopRackCard';
import type { ShopCatalogRack } from '../lib/shop.types';

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

describe('ShopRackCard', () => {
  const sampleRack: ShopCatalogRack = {
    sku: 'rack-standard-v1',
    nameKey: 'racks.mining_rack_name',
    descriptionKey: 'racks.mining_rack_desc',
    price: 80,
    currency: 'BLK',
    isPurchaseLive: true,
  };

  it('renders rack name, description, and buy button when live', () => {
    const onSelect = vi.fn();
    renderWithI18n(<ShopRackCard rack={sampleRack} shopCurrency="BLK" onSelect={onSelect} />);

    expect(screen.getByRole('heading', { name: 'Rack' })).toBeInTheDocument();
    expect(screen.getByText(/Prateleira com 8 slots/)).toBeInTheDocument();
    expect(screen.getByText(/80/)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /comprar/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(sampleRack);
  });

  it('shows coming soon and disables button when isPurchaseLive is false', () => {
    const onSelect = vi.fn();
    const comingSoonRack = { ...sampleRack, isPurchaseLive: false };
    renderWithI18n(<ShopRackCard rack={comingSoonRack} shopCurrency="BLK" onSelect={onSelect} />);

    expect(screen.getAllByText(/em breve/i).length).toBeGreaterThanOrEqual(1);

    const button = screen.getByRole('button', { name: /em breve/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
