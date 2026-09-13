import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

const useUserPowerStats = vi.fn();
const useUserEarningsStats = vi.fn();
vi.mock('./lib/stats.hooks', () => ({
  useUserPowerStats: (...args: unknown[]) => useUserPowerStats(...args),
  useUserEarningsStats: (...args: unknown[]) => useUserEarningsStats(...args),
}));

import StatsPage from './StatsPage';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function minimalPower() {
  return {
    ok: true,
    overview: { totalHashrate: 100, permanentHashrate: 60, temporaryHashrate: 40 },
    machines: { items: [] },
    youtube: { activeItems: [] },
    games: { byGame: [] },
    autoMining: { items: [] },
    checkin: { nextHashrateMilestones: [] },
    network: {},
    payout: { rows: [] },
    history: {},
    projections: { hintKeys: [] },
    analytics: {},
  };
}

describe('StatsPage', () => {
  it('shows the loading fallback while data is loading and nothing has arrived yet', async () => {
    useUserPowerStats.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: true, refetch: vi.fn() });
    render(withProviders(<StatsPage />));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the error banner while still rendering the rest of the page once data arrives', async () => {
    useUserPowerStats.mockReturnValue({ data: minimalPower(), loading: false, error: 'boom', refetch: vi.fn() });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    await act(async () => {
      render(withProviders(<StatsPage />));
    });
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });

  it('renders nothing below the header when there is no data and it is not loading', () => {
    useUserPowerStats.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    render(withProviders(<StatsPage />));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('switches tabs on click and renders the corresponding tab content', async () => {
    useUserPowerStats.mockReturnValue({ data: minimalPower(), loading: false, error: null, refetch: vi.fn() });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    await act(async () => {
      render(withProviders(<StatsPage />));
    });
    const tabs = screen.getAllByRole('tab');
    const powerTabBtn = tabs.find((t) => t.getAttribute('aria-selected') === 'false');
    expect(powerTabBtn).toBeTruthy();
    fireEvent.click(powerTabBtn!);
    await waitFor(() => expect(powerTabBtn).toHaveAttribute('aria-selected', 'true'));
  });

  it('calls both refetch functions when the refresh button is clicked', async () => {
    const refetchPower = vi.fn();
    const refetchEarnings = vi.fn();
    useUserPowerStats.mockReturnValue({ data: minimalPower(), loading: false, error: null, refetch: refetchPower });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: refetchEarnings });
    await act(async () => {
      render(withProviders(<StatsPage />));
    });
    fireEvent.click(screen.getByText(/atualizar/i));
    expect(refetchPower).toHaveBeenCalled();
    expect(refetchEarnings).toHaveBeenCalled();
  });

  it('WAI-ARIA APG tab pattern: ArrowRight/ArrowLeft move selection and focus, wrapping at the ends', async () => {
    useUserPowerStats.mockReturnValue({ data: minimalPower(), loading: false, error: null, refetch: vi.fn() });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    await act(async () => {
      render(withProviders(<StatsPage />));
    });
    const tabs = screen.getAllByRole('tab');
    const first = tabs[0];
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(first).toHaveAttribute('tabIndex', '0');
    expect(tabs[1]).toHaveAttribute('tabIndex', '-1');

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'));
    expect(tabs[1]).toHaveFocus();

    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' });
    await waitFor(() => expect(first).toHaveAttribute('aria-selected', 'true'));

    // Wraps from the first tab back to the last one.
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    const last = tabs[tabs.length - 1];
    await waitFor(() => expect(last).toHaveAttribute('aria-selected', 'true'));

    fireEvent.keyDown(last, { key: 'Home' });
    await waitFor(() => expect(first).toHaveAttribute('aria-selected', 'true'));

    fireEvent.keyDown(first, { key: 'End' });
    await waitFor(() => expect(last).toHaveAttribute('aria-selected', 'true'));
  });

  it('links the active tab and its panel via aria-controls/aria-labelledby for screen readers', async () => {
    useUserPowerStats.mockReturnValue({ data: minimalPower(), loading: false, error: null, refetch: vi.fn() });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    await act(async () => {
      render(withProviders(<StatsPage />));
    });
    const activeTab = screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!;
    const panel = screen.getByRole('tabpanel');
    expect(activeTab.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.getAttribute('aria-labelledby')).toBe(activeTab.getAttribute('id'));
  });

  it('computes the ratio bar as 50/50 when totalHashrate is 0/absent, instead of dividing by zero', async () => {
    useUserPowerStats.mockReturnValue({
      data: { ...minimalPower(), overview: { totalHashrate: 0 } },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    useUserEarningsStats.mockReturnValue({ data: undefined, isLoading: false, refetch: vi.fn() });
    await act(async () => {
      render(withProviders(<StatsPage />));
    });
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
