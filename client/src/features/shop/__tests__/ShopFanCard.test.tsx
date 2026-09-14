import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { ShopFanCard } from '../components/ShopFanCard';
import type { ShopCatalogFan } from '../lib/shop.types';

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

describe('ShopFanCard', () => {
  const sampleFan: ShopCatalogFan = {
    sku: 'cooling-fan-v1',
    nameKey: 'fans.cooling_system_name',
    descriptionKey: 'fans.cooling_system_desc',
    price: 35,
    currency: 'BLK',
    isPurchaseLive: true,
  };

  it('renders fan name, description, badge, and price when live', () => {
    const onSelect = vi.fn();
    renderWithI18n(<ShopFanCard fan={sampleFan} shopCurrency="BLK" onSelect={onSelect} />);

    expect(screen.getByText('Sistema de refrigeração')).toBeInTheDocument();
    expect(screen.getByText(/Bandeja com ventiladores/)).toBeInTheDocument();
    expect(screen.getByText(/35/)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /comprar/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(sampleFan);
  });

  it('shows coming soon badge and disables button when isPurchaseLive is false', () => {
    const onSelect = vi.fn();
    const comingSoonFan = { ...sampleFan, isPurchaseLive: false };
    renderWithI18n(<ShopFanCard fan={comingSoonFan} shopCurrency="BLK" onSelect={onSelect} />);

    expect(screen.getAllByText(/em breve/i).length).toBeGreaterThanOrEqual(1);

    const button = screen.getByRole('button', { name: /em breve/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
