import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import EarningsChartsPanel from './EarningsChartsPanel';
import type { EarningsTotals, EarningsHistoryPoint } from '../lib/stats.earnings.api';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(() => cleanup());

const zeroTotals: EarningsTotals = {
  total: 0,
  mining: 0,
  offerwall: 0,
  offerwallInternal: 0,
  offerwallExternal: 0,
  faucet: 0,
  shortlinks: 0,
  youtube: 0,
  games: 0,
  autoMining: 0,
  checkin: 0,
  referrals: 0,
};

describe('EarningsChartsPanel', () => {
  it('shows the "no data" message for both charts when totals/history are all zero/empty', () => {
    render(withProviders(<EarningsChartsPanel totals={zeroTotals} history={[]} />));
    expect(screen.getAllByText(/ainda não há dados/i).length).toBe(2);
  });

  it('excludes zero-value categories from the pie chart data (does not throw with a mix)', () => {
    const totals = { ...zeroTotals, mining: 10, offerwall: 0, faucet: 5 };
    expect(() => render(withProviders(<EarningsChartsPanel totals={totals} history={[]} />))).not.toThrow();
  });

  it('does not throw when rendering the evolution line chart with history points', () => {
    const history: EarningsHistoryPoint[] = [{ ...zeroTotals, date: '2026-01-01', total: 5 }];
    expect(() => render(withProviders(<EarningsChartsPanel totals={zeroTotals} history={history} />))).not.toThrow();
  });

  it('renders both charts side by side in "full" mode (the default)', () => {
    const { container } = render(withProviders(<EarningsChartsPanel totals={zeroTotals} history={[]} />));
    expect(container.querySelector('.xl\\:grid-cols-2')).toBeInTheDocument();
  });

  it('renders a stacked, narrower layout in "summary" mode', () => {
    const { container } = render(withProviders(<EarningsChartsPanel totals={zeroTotals} history={[]} mode="summary" />));
    expect(container.querySelector('.max-w-xl')).toBeInTheDocument();
  });
});
