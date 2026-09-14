import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BurnFeeSelector } from '../components/BurnFeeSelector';

afterEach(() => {
  cleanup();
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? k,
  }),
}));

describe('BurnFeeSelector', () => {
  const defaultBalances = {
    shib: 100,
    pol: 0.5,
    blk: 0.05,
  };

  it('renders all three currencies with their required fees', () => {
    render(
      <BurnFeeSelector
        selectedCurrency="SHIB"
        onSelectCurrency={vi.fn()}
        balances={defaultBalances}
      />
    );

    expect(screen.getAllByText('SHIB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BLK').length).toBeGreaterThan(0);
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('0.01')).toBeInTheDocument();
    expect(screen.getByText('0.001')).toBeInTheDocument();
  });

  it('calls onSelectCurrency when clicking a different currency', () => {
    const handleSelect = vi.fn();
    render(
      <BurnFeeSelector
        selectedCurrency="SHIB"
        onSelectCurrency={handleSelect}
        balances={defaultBalances}
      />
    );

    const polCard = screen.getByLabelText('fee-POL');
    fireEvent.click(polCard);
    expect(handleSelect).toHaveBeenCalledWith('POL');
  });

  it('shows insufficient warning when selected currency has balance lower than fee', () => {
    const lowBalances = {
      shib: 5, // Fee is 20
      pol: 0.5,
      blk: 0.05,
    };

    render(
      <BurnFeeSelector
        selectedCurrency="SHIB"
        onSelectCurrency={vi.fn()}
        balances={lowBalances}
      />
    );

    expect(
      screen.getByText('Saldo insuficiente para a taxa!')
    ).toBeInTheDocument();
  });
});
