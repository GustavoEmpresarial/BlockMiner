import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { OfferwallScoringPanel } from './OfferwallScoringPanel';
import type { OfferwallBreakdown, OfferwallRules } from '../lib/tournaments.types';

const i18n = i18next.createInstance();
await i18n.init({
  lng: 'pt-BR',
  resources: { 'pt-BR': { translation: ptBR } },
  interpolation: { escapeValue: false },
});

const rules: OfferwallRules = {
  zeradsMaxPerUtcDay: 100,
  tieBreak: 'first_to_reach',
  sources: [
    { key: 'internal', rule: 'per_completion', scoringFrom: null },
    { key: 'moneyRain', rule: 'per_view', scoringFrom: null },
    { key: 'multiwall', rule: 'per_credit', scoringFrom: '2026-10-10T05:00:00.000Z' },
    { key: 'zerads', rule: 'per_click_daily_cap', scoringFrom: null },
  ],
};

const breakdown: OfferwallBreakdown = {
  internal: 12,
  offerwallMe: 0,
  moneyRain: 3,
  multiwall: 2,
  offerwallGg: 0,
  zeradsRaw: 130,
  zeradsCredited: 100,
  total: 117,
  reachedAt: '2026-10-10T18:32:00.000Z',
};

function renderPanel(b: OfferwallBreakdown | null) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <OfferwallScoringPanel rules={rules} breakdown={b} loggedIn={b != null} />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe('OfferwallScoringPanel', () => {
  it('lists only the sources that count for this tournament, with their rule', () => {
    renderPanel(null);
    expect(screen.getByText('Offerwall interna')).toBeInTheDocument();
    expect(screen.getByText('Zerads PTC')).toBeInTheDocument();
    expect(screen.queryByText('Offerwall.me')).not.toBeInTheDocument();
    expect(screen.getByText('+1 pt por clique · máx. 100/dia UTC')).toBeInTheDocument();
    expect(screen.getByText(/conta a partir de .*UTC/)).toBeInTheDocument();
  });

  it('shows the player points per source, the total, the Zerads overflow and when the score was reached', () => {
    renderPanel(breakdown);
    expect(screen.getByLabelText('Seus pontos em Offerwall interna')).toHaveTextContent('12');
    expect(screen.getByLabelText('Seus pontos em Zerads PTC')).toHaveTextContent('100');
    expect(screen.getByText('117')).toBeInTheDocument();
    expect(screen.getByText(/30 clique\(s\) do Zerads passaram do limite de 100\/dia/)).toBeInTheDocument();
    expect(screen.getByText(/Você chegou a essa pontuação em .*18:32.*UTC/)).toBeInTheDocument();
  });

  it('states the tie-break and credit-only rules', () => {
    renderPanel(null);
    expect(screen.getByText(/quem chegou primeiro à pontuação/)).toBeInTheDocument();
    expect(screen.getByText(/Estorno \(chargeback\) não pontua/)).toBeInTheDocument();
  });
});
