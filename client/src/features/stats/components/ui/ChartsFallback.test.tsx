import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../../i18n/locales/pt-BR.json';
import ChartsFallback from './ChartsFallback';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

afterEach(() => cleanup());

describe('ChartsFallback', () => {
  it('renders two skeleton blocks by default (cols=2)', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <ChartsFallback />
      </I18nextProvider>,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
  });

  it('renders a single skeleton block when cols=1', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <ChartsFallback cols={1} />
      </I18nextProvider>,
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });

  it('exposes an accessible busy status role', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ChartsFallback />
      </I18nextProvider>,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });
});
