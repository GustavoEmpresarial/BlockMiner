import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';
import ManualPage from './ManualPage';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

describe('ManualPage — Peças & Merge', () => {
  it('tem a seção de peças com o guia de peças grátis e as faixas das offerwalls', () => {
    const { container } = render(
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>
          <ManualPage />
        </I18nextProvider>
      </MemoryRouter>,
    );
    const section = container.querySelector('section#pecas');
    expect(section).toBeTruthy();
    expect(screen.getByRole('heading', { name: ptBR.manual.parts.title })).toBeInTheDocument();
    expect(screen.getByTestId('free-parts-guide')).toBeInTheDocument();
    expect(screen.getByText(ptBR.manual.parts.offerwall_tiers)).toBeInTheDocument();
  });
});
