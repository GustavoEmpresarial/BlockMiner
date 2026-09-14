import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { ShopPurchaseModal } from '../components/ShopPurchaseModal';
import type { PurchaseModalState } from '../lib/shop.types';

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

describe('ShopPurchaseModal', () => {
  const minerModal: PurchaseModalState = {
    kind: 'miner',
    item: {
      id: 5,
      name: 'WhatsMiner M30S',
      baseHashRate: 88000,
      price: 200,
      currency: 'BLK',
    },
  };

  it('renders nothing when modal is null', () => {
    const { container } = renderWithI18n(
      <ShopPurchaseModal
        modal={null}
        shopCurrency="BLK"
        buying={false}
        quantity={1}
        onClose={vi.fn()}
        onSetQuantity={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders miner details and total price', () => {
    renderWithI18n(
      <ShopPurchaseModal
        modal={minerModal}
        shopCurrency="BLK"
        buying={false}
        quantity={2}
        onClose={vi.fn()}
        onSetQuantity={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('WhatsMiner M30S')).toBeInTheDocument();
    expect(screen.getByText(/Confirmar compra/i)).toBeInTheDocument();
    // 200 * 2 = 400.00
    expect(screen.getByText(/400\.00/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('handles quantity increment and decrement calls', () => {
    const onSetQuantity = vi.fn();
    renderWithI18n(
      <ShopPurchaseModal
        modal={minerModal}
        shopCurrency="BLK"
        buying={false}
        quantity={3}
        onClose={vi.fn()}
        onSetQuantity={onSetQuantity}
        onConfirm={vi.fn()}
      />,
    );

    const minusBtn = screen.getByLabelText(/diminuir/i);
    const plusBtn = screen.getByLabelText(/aumentar/i);

    fireEvent.click(minusBtn);
    expect(onSetQuantity).toHaveBeenCalledTimes(1);

    fireEvent.click(plusBtn);
    expect(onSetQuantity).toHaveBeenCalledTimes(2);
  });

  it('disables decrease button when quantity is 1', () => {
    renderWithI18n(
      <ShopPurchaseModal
        modal={minerModal}
        shopCurrency="BLK"
        buying={false}
        quantity={1}
        onClose={vi.fn()}
        onSetQuantity={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const minusBtn = screen.getByLabelText(/diminuir/i);
    expect(minusBtn).toBeDisabled();
  });

  it('fires onConfirm when clicking confirm button', () => {
    const onConfirm = vi.fn();
    renderWithI18n(
      <ShopPurchaseModal
        modal={minerModal}
        shopCurrency="BLK"
        buying={false}
        quantity={1}
        onClose={vi.fn()}
        onSetQuantity={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const confirmBtn = screen.getByRole('button', { name: /confirmar pagamento/i });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape key press when not buying', () => {
    const onClose = vi.fn();
    renderWithI18n(
      <ShopPurchaseModal
        modal={minerModal}
        shopCurrency="BLK"
        buying={false}
        quantity={1}
        onClose={onClose}
        onSetQuantity={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
