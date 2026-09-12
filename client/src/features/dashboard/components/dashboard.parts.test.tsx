import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { DashboardHistory, DashboardEfficiencyCard, DashboardActivityCard } from './dashboard.parts';

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
