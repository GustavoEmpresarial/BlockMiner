import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { DashboardHistory, DashboardEfficiencyCard, DashboardActivityCard, DashboardCards } from './dashboard.parts';
import { emptyDashboardWalletBalances } from '../lib/dashboardBalanceCurrency';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>
  );
}

afterEach(() => cleanup());

const baseCardsProps = {
  cycle: null,
  blkBalance: null,
  walletBalances: emptyDashboardWalletBalances(),
  balanceCurrency: 'POL' as const,
  onBalanceCurrencyChange: () => {},
  speedVal: '1.2',
  speedUnit: 'H/s',
  netVal: '3.4',
  netUnit: 'H/s',
};

describe('DashboardCards', () => {
  it('shows an em dash for the BLK card when blkBalance is null', () => {
    render(withProviders(<DashboardCards {...baseCardsProps} />));
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('adds pendingPol on top of the wallet POL balance for the live-accrual display', () => {
    render(
      withProviders(
        <DashboardCards
          {...baseCardsProps}
          walletBalances={{ ...emptyDashboardWalletBalances(), POL: 10 }}
          pendingPol={0.5}
          balanceDecimals={2}
        />,
      ),
    );
    expect(screen.getByText('10.50')).toBeInTheDocument();
  });

  it('uses blkBalance over the wallet BLK field when displaying the BLK currency card', () => {
    render(
      withProviders(
        <DashboardCards
          {...baseCardsProps}
          balanceCurrency="BLK"
          blkBalance={7}
          walletBalances={{ ...emptyDashboardWalletBalances(), BLK: 999 }}
        />,
      ),
    );
    expect(screen.getAllByText(/7\.0000/).length).toBeGreaterThan(0);
  });

  it('falls back to cycle.blockCountdownSeconds when no smoothed countdownSeconds prop is given', () => {
    render(withProviders(<DashboardCards {...baseCardsProps} cycle={{ blockCountdownSeconds: 42 }} />));
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('opens the currency picker, lets you pick a different currency, and closes on selection', () => {
    const onChange = vi.fn();
    render(withProviders(<DashboardCards {...baseCardsProps} onBalanceCurrencyChange={onChange} />));
    fireEvent.click(screen.getByRole('button', { name: /POL/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('closes the currency picker on Escape', () => {
    render(withProviders(<DashboardCards {...baseCardsProps} />));
    fireEvent.click(screen.getByRole('button', { name: /POL/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes the currency picker on an outside click', () => {
    render(withProviders(<DashboardCards {...baseCardsProps} />));
    fireEvent.click(screen.getByRole('button', { name: /POL/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('flips the picker menu upward when there is not enough room below the button', () => {
    const original = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { value: 50, configurable: true, writable: true });
    try {
      render(withProviders(<DashboardCards {...baseCardsProps} />));
      fireEvent.click(screen.getByRole('button', { name: /POL/i }));
      const menu = screen.getByRole('listbox');
      expect(Number.parseFloat(menu.style.top)).toBeLessThan(50);
    } finally {
      Object.defineProperty(window, 'innerHeight', { value: original, configurable: true, writable: true });
    }
  });

  it('does not throw when the picker is closed again before its deferred re-measure animation frame fires', async () => {
    const { unmount } = render(withProviders(<DashboardCards {...baseCardsProps} />));
    fireEvent.click(screen.getByRole('button', { name: /POL/i }));
    unmount();
    // The re-measure requestAnimationFrame(place) scheduled on open must be
    // cancelled on cleanup — otherwise it fires after unmount and throws on
    // the now-null btnRef (regression: raw `btnRef.current!.getBoundingClientRect()`).
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

  it('falls back to the currency-initial glyph when the logo image fails to load', () => {
    render(withProviders(<DashboardCards {...baseCardsProps} balanceCurrency="SHIB" />));
    // The same logoUrl renders twice (the Card's own icon area + the currency-picker
    // toggle button), each tracking its own load-failure state independently.
    const pickerBtn = screen.getByRole('button', { name: /SHIB/i });
    const img = pickerBtn.querySelector('img');
    expect(img).toBeInTheDocument();
    fireEvent.error(img!);
    expect(pickerBtn.querySelector('img')).not.toBeInTheDocument();
    expect(pickerBtn.querySelector('span')).toHaveTextContent('S');
  });
});

describe('DashboardHistory', () => {
  it('shows the empty state when there is no block history', () => {
    render(withProviders(<DashboardHistory blockHistory={[]} tokenSymbol="BLK" />));
    expect(screen.getAllByText(/Aguardando a conclusão/i).length).toBeGreaterThan(0);
  });

  it('renders a row per block and shows the DB-persist-failed marker when set', () => {
    render(
      withProviders(
        <DashboardHistory
          blockHistory={[
            { blockNumber: 5, userReward: 1, totalReward: 2, persistFailed: true, timestamp: Date.now() },
          ]}
          tokenSymbol="BLK"
        />,
      ),
    );
    expect(screen.getAllByText('#5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DB').length).toBeGreaterThan(0);
  });

  it('shows the SHIB share of both the user reward and the block total when present', () => {
    render(
      withProviders(
        <DashboardHistory
          blockHistory={[
            { blockNumber: 9, userReward: 1, userRewardShib: 50, totalReward: 2, totalRewardShib: 100 },
          ]}
          tokenSymbol="BLK"
        />,
      ),
    );
    expect(screen.getAllByText(/50\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/100\.00 SHIB/).length).toBeGreaterThan(0);
  });

  it('does not throw on a malformed block row missing every optional field', () => {
    expect(() =>
      render(withProviders(<DashboardHistory blockHistory={[{}]} tokenSymbol={undefined} />)),
    ).not.toThrow();
  });
});

describe('DashboardEfficiencyCard', () => {
  it('shows a loading spinner while loading', () => {
    const { container } = render(
      withProviders(<DashboardEfficiencyCard freeRacks={null} inventoryCount={null} loading />),
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('suggests installing inventory when both free racks and idle inventory exist', () => {
    render(withProviders(<DashboardEfficiencyCard freeRacks={2} inventoryCount={3} loading={false} />));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/inventory');
  });

  it('suggests the shop when there are free racks but no idle inventory', () => {
    render(withProviders(<DashboardEfficiencyCard freeRacks={2} inventoryCount={0} loading={false} />));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/shop');
  });

  it('treats null counts as 0 instead of crashing', () => {
    expect(() =>
      render(withProviders(<DashboardEfficiencyCard freeRacks={null} inventoryCount={null} loading={false} />)),
    ).not.toThrow();
  });
});

describe('DashboardActivityCard', () => {
  it('shows a loading spinner while loading', () => {
    const { container } = render(
      withProviders(
        <DashboardActivityCard
          completionsToday={null}
          requiredForWaiver={null}
          feeWaived={false}
          feeAlreadyChargedToday={false}
          loading
        />,
      ),
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders nothing once the fee was already charged today and not waived', () => {
    const { container } = render(
      withProviders(
        <DashboardActivityCard
          completionsToday={1}
          requiredForWaiver={10}
          feeWaived={false}
          feeAlreadyChargedToday
          loading={false}
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the waived message when feeWaived is true', () => {
    render(
      withProviders(
        <DashboardActivityCard
          completionsToday={10}
          requiredForWaiver={10}
          feeWaived
          feeAlreadyChargedToday={false}
          loading={false}
        />,
      ),
    );
    expect(screen.getByText(/isenta/)).toBeInTheDocument();
  });

  it('clamps progress at 100% instead of overflowing when completions exceed the requirement', () => {
    const { container } = render(
      withProviders(
        <DashboardActivityCard
          completionsToday={99}
          requiredForWaiver={10}
          feeWaived={false}
          feeAlreadyChargedToday={false}
          loading={false}
        />,
      ),
    );
    const bar = container.querySelector('[style*="width"]') as HTMLElement | null;
    expect(bar?.style.width).toBe('100%');
  });
});
