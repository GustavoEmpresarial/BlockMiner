import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import ToolsTab from './ToolsTab';
import { withProviders, baseContext } from './testHelpers';

afterEach(() => cleanup());

describe('ToolsTab', () => {
  it('renders the power CSV export button and triggers a download on click', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
    try {
      await act(async () => {
        render(withProviders(<ToolsTab {...baseContext()} />));
      });
      const btn = await screen.findByText(/exportar csv/i);
      fireEvent.click(btn);
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('only shows the earnings export button when earnings data is present', async () => {
    await act(async () => {
      render(withProviders(<ToolsTab {...baseContext({ earnings: undefined })} />));
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
            <ToolsTab
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

  it('lazily loads the CalculatorPage', async () => {
    render(withProviders(<ToolsTab {...baseContext()} />));
    // The Suspense boundary must eventually resolve past its loading fallback.
    await waitForElementToBeRemoved(() => screen.queryByRole('status'), { timeout: 5000 });
  });
});
