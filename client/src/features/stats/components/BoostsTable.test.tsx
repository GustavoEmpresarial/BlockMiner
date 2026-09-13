import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import BoostsTable from './BoostsTable';
import type { ExpiryRow } from './ExpiryProgressList';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BoostsTable', () => {
  it('shows the empty-state message when there are no rows', () => {
    render(withProviders(<BoostsTable rows={[]} />));
    expect(screen.getByText(/sem bónus temporários/i)).toBeInTheDocument();
  });

  it('renders a table row per boost, sorted by expiresAt', () => {
    const rows: ExpiryRow[] = [
      { source: 'youtube', slug: 'b', name: 'Boost B', hashRate: 2, expiresAt: '2026-01-03T00:00:00Z', playedAt: '2026-01-01T00:00:00Z' },
      { source: 'game', slug: 'a', name: 'Boost A', hashRate: 1, expiresAt: '2026-01-02T00:00:00Z', playedAt: '2026-01-01T00:00:00Z' },
    ];
    render(withProviders(<BoostsTable rows={rows} />));
    const cells = screen.getAllByText(/Boost [AB]/).map((n) => n.textContent);
    expect(cells).toEqual(['Boost A', 'Boost B']);
  });

  it('marks an expired boost with a full-width red bar and the "expired" label', () => {
    const rows: ExpiryRow[] = [
      { source: 'game', slug: 'x', name: 'Expired', hashRate: 1, expiresAt: '2026-01-01T00:00:00Z', playedAt: '2025-12-31T00:00:00Z' },
    ];
    const { container } = render(withProviders(<BoostsTable rows={rows} />));
    expect(screen.getByText(/expirad/i)).toBeInTheDocument();
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('does not throw when a row is missing every optional field', () => {
    expect(() =>
      render(withProviders(<BoostsTable rows={[{ source: 'faucet', name: 'x' } as ExpiryRow]} />)),
    ).not.toThrow();
  });

  it('re-renders the remaining time every second', () => {
    const rows: ExpiryRow[] = [
      { source: 'game', slug: 'x', name: 'Ticking', hashRate: 1, expiresAt: '2026-01-01T12:00:30Z', playedAt: '2026-01-01T12:00:00Z' },
    ];
    render(withProviders(<BoostsTable rows={rows} />));
    expect(screen.getByText('30s')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('29s')).toBeInTheDocument();
  });
});
