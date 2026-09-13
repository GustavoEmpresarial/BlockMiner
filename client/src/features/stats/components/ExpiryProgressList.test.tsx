import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import ExpiryProgressList, { formatDurationMs, progressPercentAt, type ExpiryRow } from './ExpiryProgressList';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

describe('formatDurationMs', () => {
  it('returns "0s" for zero or negative durations', () => {
    expect(formatDurationMs(0)).toBe('0s');
    expect(formatDurationMs(-5000)).toBe('0s');
  });

  it('formats seconds only under a minute', () => {
    expect(formatDurationMs(45_000)).toBe('45s');
  });

  it('formats minutes and seconds under an hour', () => {
    expect(formatDurationMs(65_000)).toBe('1m 5s');
  });

  it('formats hours and minutes under a day', () => {
    expect(formatDurationMs(2 * 3_600_000 + 5 * 60_000)).toBe('2h 5m');
  });

  it('formats days and hours at/above a day', () => {
    expect(formatDurationMs(2 * 86_400_000 + 3 * 3_600_000)).toBe('2d 3h');
  });
});

describe('progressPercentAt', () => {
  it('returns 0 when playedAt or expiresAt is missing', () => {
    expect(progressPercentAt(null, '2026-01-02', Date.now())).toBe(0);
    expect(progressPercentAt('2026-01-01', null, Date.now())).toBe(0);
  });

  it('returns 0 when the window has zero or negative duration', () => {
    expect(progressPercentAt('2026-01-02', '2026-01-01', Date.now())).toBe(0);
  });

  it('computes 50% at the midpoint of the window', () => {
    const start = new Date('2026-01-01T00:00:00Z').getTime();
    const end = new Date('2026-01-02T00:00:00Z').getTime();
    const mid = (start + end) / 2;
    expect(progressPercentAt('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', mid)).toBe(50);
  });

  it('clamps to 0 before the window starts and 100 after it ends', () => {
    const start = new Date('2026-01-01T00:00:00Z').getTime();
    const end = new Date('2026-01-02T00:00:00Z').getTime();
    expect(progressPercentAt('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', start - 60_000)).toBe(0);
    expect(progressPercentAt('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', end + 60_000)).toBe(100);
  });
});

describe('ExpiryProgressList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the empty-state message when there are no rows', () => {
    render(withProviders(<ExpiryProgressList rows={[]} />));
    expect(screen.getByText(/sem bónus temporários/i)).toBeInTheDocument();
  });

  it('renders one row per boost, sorted by expiresAt', () => {
    const rows: ExpiryRow[] = [
      { source: 'youtube', slug: 'b', name: 'Boost B', hashRate: 2, expiresAt: '2026-01-03T00:00:00Z', playedAt: '2026-01-01T00:00:00Z' },
      { source: 'game', slug: 'a', name: 'Boost A', hashRate: 1, expiresAt: '2026-01-02T00:00:00Z', playedAt: '2026-01-01T00:00:00Z' },
    ];
    render(withProviders(<ExpiryProgressList rows={rows} />));
    const names = screen.getAllByText(/Boost [AB]/).map((n) => n.textContent);
    expect(names).toEqual(['Boost A', 'Boost B']);
  });

  it('marks a boost past its expiresAt as expired, with a full-width red bar', () => {
    const rows: ExpiryRow[] = [
      { source: 'game', slug: 'x', name: 'Expired Boost', hashRate: 1, expiresAt: '2026-01-01T00:00:00Z', playedAt: '2025-12-31T00:00:00Z' },
    ];
    const { container } = render(withProviders(<ExpiryProgressList rows={rows} />));
    expect(screen.getByText(/expirad/i)).toBeInTheDocument();
    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });

  it('does not throw when a row has no expiresAt/playedAt at all', () => {
    const rows: ExpiryRow[] = [{ source: 'faucet', slug: null, name: 'No dates' }];
    expect(() => render(withProviders(<ExpiryProgressList rows={rows} />))).not.toThrow();
  });

  it('re-renders the countdown every second via its internal tick interval', () => {
    const rows: ExpiryRow[] = [
      { source: 'game', slug: 'x', name: 'Ticking', hashRate: 1, expiresAt: '2026-01-01T12:00:30Z', playedAt: '2026-01-01T12:00:00Z' },
    ];
    render(withProviders(<ExpiryProgressList rows={rows} />));
    expect(screen.getByText('30s')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('29s')).toBeInTheDocument();
  });
});
