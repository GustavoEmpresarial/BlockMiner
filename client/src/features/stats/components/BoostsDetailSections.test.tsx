import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import BoostsDetailSections from './BoostsDetailSections';
import type { UserPowerStatsPayload } from '../lib/stats.api';

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

describe('BoostsDetailSections', () => {
  it('does not throw when every power sub-object is entirely missing', () => {
    expect(() => render(withProviders(<BoostsDetailSections power={{} as UserPowerStatsPayload} />))).not.toThrow();
  });

  it('renders a youtube active item with its expiry badge', () => {
    const power = {
      youtube: { activeTotal: 10, activeItems: [{ id: 1, sourceVideoId: 'vid123', hashRate: 10, expiresAt: '2026-01-01T12:00:30Z' }], history: [] },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getByText('vid123')).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  it('shows "expired" once the item is past its expiresAt', () => {
    const power = {
      youtube: { activeTotal: 0, activeItems: [{ id: 1, sourceVideoId: 'old', hashRate: 1, expiresAt: '2026-01-01T00:00:00Z' }], history: [] },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getAllByText(/expirad/i).length).toBeGreaterThan(0);
  });

  it('shows an em-dash fallback when a video id is missing', () => {
    const power = {
      youtube: { activeTotal: 0, activeItems: [{ id: 1, sourceVideoId: '', hashRate: 1, expiresAt: null }], history: [] },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders game rows grouped by game with their own expiry badges', () => {
    const power = {
      games: {
        minigameTotal: 5,
        checkinBonusTotal: 1,
        byGame: [{ slug: 'g1', name: '2048', totalHashRate: 3, items: [{ id: 1, hashRate: 3, expiresAt: '2026-01-01T12:00:10Z' }] }],
      },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getByText('2048')).toBeInTheDocument();
    expect(screen.getByText('10s')).toBeInTheDocument();
  });

  it('renders auto-mining items with their expiry badges', () => {
    const power = {
      autoMining: { total: 5, items: [{ id: 1, gpuHashRate: 5, expiresAt: '2026-01-01T12:00:05Z' }] },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getByText('5s')).toBeInTheDocument();
  });

  it('renders checkin streak and milestones, appending the display title when present', () => {
    const power = {
      checkin: {
        streak: 3,
        nextHashrateMilestones: [{ dayThreshold: 7, rewardValue: 10, validityDays: 30, displayTitle: 'Week badge' }],
      },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getByText(/Week badge/)).toBeInTheDocument();
  });

  it('ticks the expiry badge countdown every second', () => {
    const power = {
      youtube: { activeTotal: 1, activeItems: [{ id: 1, sourceVideoId: 'v', hashRate: 1, expiresAt: '2026-01-01T12:00:30Z' }], history: [] },
    } as unknown as UserPowerStatsPayload;
    render(withProviders(<BoostsDetailSections power={power} />));
    expect(screen.getByText('30s')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('29s')).toBeInTheDocument();
  });
});
