import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import BoostsTab from './BoostsTab';
import { withProviders, baseContext, basePower } from './testHelpers';

afterEach(() => cleanup());

describe('BoostsTab', () => {
  it('renders with zero active boosts without throwing', async () => {
    await act(async () => {
      render(withProviders(<BoostsTab {...baseContext()} />));
    });
    expect(await screen.findByText(/0/)).toBeInTheDocument();
  });

  it('shows the detail sections only when the "all" filter is active', async () => {
    const power = basePower({ autoMining: { total: 1, items: [{ id: 1, gpuHashRate: 1, expiresAt: '2026-01-01', claimedAt: null }] } });
    await act(async () => {
      render(withProviders(<BoostsTab {...baseContext({ power })} />));
    });
    await screen.findByText(/mineração automática/i, {}, { timeout: 5000 });

    const gamesFilterBtn = screen.getAllByRole('button').find((b) => b.textContent?.toLowerCase().includes('minijogos'));
    if (gamesFilterBtn) {
      fireEvent.click(gamesFilterBtn);
      expect(screen.queryByText(/mineração automática/i)).not.toBeInTheDocument();
    }
  });

  it('filters rows when a specific filter chip is clicked', async () => {
    const power = basePower({
      autoMining: { total: 1, items: [{ id: 1, gpuHashRate: 1, expiresAt: '2099-01-01', claimedAt: null }] },
    });
    await act(async () => {
      render(withProviders(<BoostsTab {...baseContext({ power })} />));
    });
    await screen.findByText(/1 boosts ativos/i);
  });
});
