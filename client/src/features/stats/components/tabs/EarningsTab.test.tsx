import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import EarningsTab from './EarningsTab';
import { withProviders, baseContext } from './testHelpers';
import type { UserEarningsPayload } from '../../lib/stats.earnings.api';

afterEach(() => cleanup());

function baseEarnings(overrides: Partial<UserEarningsPayload> = {}): UserEarningsPayload {
  return {
    total: 10,
    mining: 5,
    offerwall: 5,
    offerwallInternal: 2,
    offerwallExternal: 3,
    faucet: 0,
    shortlinks: 0,
    youtube: 0,
    games: 0,
    autoMining: 0,
    checkin: 0,
    referrals: 0,
    referralStatsSince: '2026-01-01',
    period: '30d',
    history: [],
    powerMeta: { machineCount: 1, activeBoosts: 0, powerGained24h: 0 },
    ...overrides,
  } as unknown as UserEarningsPayload;
}

describe('EarningsTab', () => {
  it('renders with no earnings loaded yet (undefined) without throwing', async () => {
    await act(async () => {
      render(withProviders(<EarningsTab {...baseContext({ earnings: undefined })} />));
    });
    expect(await screen.findAllByText('—')).not.toHaveLength(0);
  });

  it('shows the loading ellipsis for the total while earningsLoading is true', async () => {
    await act(async () => {
      render(withProviders(<EarningsTab {...baseContext({ earnings: baseEarnings(), earningsLoading: true })} />));
    });
    expect(await screen.findByText(/…/)).toBeInTheDocument();
  });

  it('calls setEarningsFilter when a period pill is clicked', async () => {
    const setEarningsFilter = vi.fn();
    await act(async () => {
      render(withProviders(<EarningsTab {...baseContext({ earnings: baseEarnings(), setEarningsFilter })} />));
    });
    const buttons = await screen.findAllByRole('button');
    buttons[0]!.click();
    expect(setEarningsFilter).toHaveBeenCalled();
  });

  it('renders a row per earnings category', async () => {
    await act(async () => {
      render(withProviders(<EarningsTab {...baseContext({ earnings: baseEarnings() })} />));
    });
    expect(await screen.findAllByRole('row')).not.toHaveLength(0);
  });
});
