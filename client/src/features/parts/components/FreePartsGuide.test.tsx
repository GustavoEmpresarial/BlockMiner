import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import en from '../../../i18n/locales/en.json';
import es from '../../../i18n/locales/es.json';
import { FreePartsGuide } from './FreePartsGuide';
import { bpsToPercentLabel, DEFAULT_PART_DROP_RATES } from '../lib/parts.dropRates';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function renderGuide(props: Parameters<typeof FreePartsGuide>[0] = {}) {
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <FreePartsGuide {...props} />
      </I18nextProvider>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('FreePartsGuide', () => {
  it('lista cada fonte de drop com link para a página dela', () => {
    renderGuide();
    const expected: Record<string, string> = {
      faucet: '/faucet',
      ptc: '/ptc',
      automining: '/auto-mining',
      youtube: '/youtube',
      shortlinks: '/shortlinks',
      internal_offerwall: '/internal-offerwall',
      offerwall: '/offerwall',
    };
    for (const [key, href] of Object.entries(expected)) {
      expect(screen.getByTestId(`free-parts-source-${key}`)).toHaveAttribute('href', href);
    }
  });

  it('sem taxas do servidor usa os padrões (30% faucet/PTC, 10% auto-mining/YouTube/shortlinks)', () => {
    renderGuide();
    expect(within(screen.getByTestId('free-parts-source-faucet')).getByText('30% de chance por claim')).toBeInTheDocument();
    expect(within(screen.getByTestId('free-parts-source-youtube')).getByText('10% de chance por claim')).toBeInTheDocument();
    expect(within(screen.getByTestId('free-parts-source-offerwall')).getByText(/de 40% a garantida/)).toBeInTheDocument();
  });

  it('mostra as taxas vivas quando o servidor manda outras', () => {
    renderGuide({ rates: { activityBps: 2500, frequentActivityBps: 750, offerwallMicroBps: 4000 } });
    expect(within(screen.getByTestId('free-parts-source-ptc')).getByText('25% de chance por claim')).toBeInTheDocument();
    expect(within(screen.getByTestId('free-parts-source-shortlinks')).getByText('7.5% de chance por claim')).toBeInTheDocument();
  });

  it('o link de compra aponta para Ofertas e some quando showBuyHint=false', () => {
    const { unmount } = renderGuide();
    expect(screen.getByRole('link', { name: ptBR.parts.free_guide.buy_link })).toHaveAttribute('href', '/offers');
    unmount();
    renderGuide({ showBuyHint: false });
    expect(screen.queryByRole('link', { name: ptBR.parts.free_guide.buy_link })).not.toBeInTheDocument();
  });

  it('os 3 idiomas têm todas as chaves do guia', () => {
    const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    const base = keys(ptBR.parts.free_guide).sort();
    expect(keys(en.parts.free_guide).sort()).toEqual(base);
    expect(keys(es.parts.free_guide).sort()).toEqual(base);
    expect(keys(en.manual.parts).sort()).toEqual(keys(ptBR.manual.parts).sort());
    expect(keys(es.manual.parts).sort()).toEqual(keys(ptBR.manual.parts).sort());
  });

  it('bpsToPercentLabel', () => {
    expect(bpsToPercentLabel(DEFAULT_PART_DROP_RATES.activityBps)).toBe('30');
    expect(bpsToPercentLabel(750)).toBe('7.5');
    expect(bpsToPercentLabel(0)).toBe('0');
  });
});
