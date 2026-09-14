import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { ShopMinerCard } from '../components/ShopMinerCard';
import type { ShopCatalogMiner } from '../lib/shop.types';

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

describe('ShopMinerCard', () => {
  const sampleMiner: ShopCatalogMiner = {
    id: 101,
    name: 'Antminer S19 Pro',
    baseHashRate: 110000,
    price: 250,
    currency: 'BLK',
    imageUrl: 'https://example.com/s19.png',
  };

  it('renders miner name, hashrate, and price', () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <ShopMinerCard miner={sampleMiner} shopCurrency="BLK" onSelect={onSelect} />,
    );

    expect(screen.getByText('Antminer S19 Pro')).toBeInTheDocument();
    // 110000 GH/s or formatted string
    expect(screen.getByText(/110/)).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByText('BLK')).toBeInTheDocument();
  });

  it('fires onSelect when clicking the buy button', () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <ShopMinerCard miner={sampleMiner} shopCurrency="BLK" onSelect={onSelect} />,
    );

    const button = screen.getByRole('button', { name: /comprar/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(sampleMiner);
  });

  it('disables the button when price is non-positive or invalid', () => {
    const onSelect = vi.fn();
    const invalidMiner = { ...sampleMiner, price: 0 };
    renderWithI18n(
      <ShopMinerCard miner={invalidMiner} shopCurrency="BLK" onSelect={onSelect} />,
    );

    const button = screen.getByRole('button', { name: /comprar/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
