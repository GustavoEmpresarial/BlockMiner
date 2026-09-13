import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import PowerChartsPanel from './PowerChartsPanel';
import type { PowerStatsHistory, UserPowerStatsPayload } from '../lib/stats.api';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

function overviewOf(overrides: Record<string, unknown>) {
  return overrides as unknown as UserPowerStatsPayload['overview'];
}

function historyOf(overrides: Record<string, unknown>) {
  return overrides as unknown as PowerStatsHistory;
}

afterEach(() => cleanup());

describe('PowerChartsPanel', () => {
  it('renders nothing when overview is absent', () => {
    const { container } = render(withProviders(<PowerChartsPanel overview={null} history={null} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the pie "no data" message when overview has no breakdown', () => {
    render(withProviders(<PowerChartsPanel overview={overviewOf({})} history={null} />));
    expect(screen.getByText(/ainda não há dados/i)).toBeInTheDocument();
  });

  it('does not throw with a full breakdown, and always renders the permanent/temporary bar chart', () => {
    const overview = overviewOf({
      breakdown: { machines: 10, gamesMinigame: 5, gamesCheckin: 2, youtube: 3, autoMining: 1 },
      permanentHashrate: 10,
      temporaryHashrate: 11,
    });
    expect(() => render(withProviders(<PowerChartsPanel overview={overview} history={null} />))).not.toThrow();
  });

  it('excludes zero-value slices from the pie summary', () => {
    const overview = overviewOf({ breakdown: { machines: 10, gamesMinigame: 0, gamesCheckin: 0, youtube: 0, autoMining: 0 } });
    render(withProviders(<PowerChartsPanel overview={overview} history={null} />));
    expect(screen.getByText(/^Máquinas: 10\.00 H\/s$/)).toBeInTheDocument();
  });

  it('only renders the mining-share-history chart when there is more than one data point', () => {
    const overview = overviewOf({ breakdown: {} });
    const { rerender, container } = render(
      withProviders(
        <PowerChartsPanel
          overview={overview}
          history={historyOf({ miningLogByDay: [{ date: '2026-01-01', avgSharePercent: 5 }] })}
        />,
      ),
    );
    expect(screen.queryByText(/histórico de participação/i)).not.toBeInTheDocument();

    rerender(
      withProviders(
        <PowerChartsPanel
          overview={overview}
          history={historyOf({
            miningLogByDay: [
              { date: '2026-01-01', avgSharePercent: 5 },
              { date: '2026-01-02', avgSharePercent: 6 },
            ],
          })}
        />,
      ),
    );
    expect(container.querySelector('.xl\\:col-span-2')).toBeInTheDocument();
  });

  it('only renders the BLK pool history chart when there is more than one cycle, capped at the last 14', () => {
    const overview = overviewOf({ breakdown: {} });
    const manyCycles = Array.from({ length: 20 }, (_, i) => ({
      windowStart: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      totalHashrate: i,
    }));
    expect(() =>
      render(withProviders(<PowerChartsPanel overview={overview} history={historyOf({ blkCycles: manyCycles })} />)),
    ).not.toThrow();
  });

  it('does not throw when a blkCycle has no windowStart', () => {
    const overview = overviewOf({ breakdown: {} });
    const cycles = [{ windowStart: null, totalHashrate: 1 }, { windowStart: null, totalHashrate: 2 }];
    expect(() =>
      render(withProviders(<PowerChartsPanel overview={overview} history={historyOf({ blkCycles: cycles })} />)),
    ).not.toThrow();
  });
});
