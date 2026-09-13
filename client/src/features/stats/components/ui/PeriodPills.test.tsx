import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../../i18n/locales/pt-BR.json';
import PeriodPills from './PeriodPills';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(() => cleanup());

describe('PeriodPills', () => {
  it('renders a pill for every period', () => {
    render(withProviders(<PeriodPills value="30d" onChange={vi.fn()} />));
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  it('highlights the currently selected period', () => {
    render(withProviders(<PeriodPills value="7d" onChange={vi.fn()} />));
    const buttons = screen.getAllByRole('button');
    const selected = buttons.find((b) => b.className.includes('bg-sky-500'));
    expect(selected).toBeDefined();
  });

  it('calls onChange with the clicked period', () => {
    const onChange = vi.fn();
    render(withProviders(<PeriodPills value="30d" onChange={onChange} />));
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(onChange).toHaveBeenCalledWith('today');
  });
});
