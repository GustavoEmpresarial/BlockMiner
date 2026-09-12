import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import HistoryTab from './HistoryTab';
import { withProviders, baseContext, basePower } from './testHelpers';

afterEach(() => cleanup());

describe('HistoryTab', () => {
  it('renders without throwing when analytics fields are missing', async () => {
    await act(async () => {
      render(withProviders(<HistoryTab {...baseContext({ power: basePower({ analytics: undefined }) })} />));
    });
    expect(await screen.findAllByText('—')).not.toHaveLength(0);
  });

  it('renders analytics values when present', async () => {
    const power = basePower({ analytics: { miningLogPeakShare: 0.5, miningLogAvgShare: 0.25, miningLogSamples: 10 } });
    await act(async () => {
      render(withProviders(<HistoryTab {...baseContext({ power })} />));
    });
    expect(await screen.findByText('0.5000')).toBeInTheDocument();
  });

  it('triggers the power CSV export when the export button is clicked', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
    try {
      await act(async () => {
        render(withProviders(<HistoryTab {...baseContext()} />));
      });
      const exportBtn = await screen.findByText(/exportar csv/i);
      fireEvent.click(exportBtn);
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevoke;
      vi.restoreAllMocks();
    }
  });

  it('only shows the earnings export button when earnings data is present', async () => {
    await act(async () => {
      render(withProviders(<HistoryTab {...baseContext({ earnings: undefined })} />));
    });
    await screen.findByText(/exportar csv/i);
    expect(screen.queryByText(/exportar ganhos/i)).not.toBeInTheDocument();
  });

  it('shows and triggers the earnings export button when earnings data is present', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
    try {
      await act(async () => {
        render(
          withProviders(
            <HistoryTab
              {...baseContext({
                earnings: {
                  total: 1,
                  mining: 1,
                  offerwall: 0,
                  faucet: 0,
                  shortlinks: 0,
                  autoMining: 0,
                  games: 0,
                  youtube: 0,
                  checkin: 0,
                  referrals: 0,
                  history: [],
                } as never,
              })}
            />,
          ),
        );
      });
      const btn = await screen.findByText(/exportar ganhos/i);
      fireEvent.click(btn);
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
