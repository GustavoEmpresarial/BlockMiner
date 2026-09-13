import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import SummaryTab from './SummaryTab';
import { withProviders, baseContext, basePower } from './testHelpers';

afterEach(() => cleanup());

describe('SummaryTab', () => {
  it('renders without throwing when earnings/powerMeta are entirely absent', async () => {
    await act(async () => {
      render(withProviders(<SummaryTab {...baseContext({ earnings: undefined })} />));
    });
    expect(await screen.findAllByText('—')).not.toHaveLength(0);
  });

  it('shows the loading ellipsis for the earnings total while earningsLoading is true', async () => {
    await act(async () => {
      render(withProviders(<SummaryTab {...baseContext({ earningsLoading: true })} />));
    });
    expect((await screen.findAllByText('…')).length).toBeGreaterThan(0);
  });

  it('navigates to the boosts tab when "view all" is clicked', async () => {
    const onNavigateTab = vi.fn();
    await act(async () => {
      render(withProviders(<SummaryTab {...baseContext({ onNavigateTab })} />));
    });
    const viewAll = await screen.findByText(/ver tudo|ver todos/i);
    fireEvent.click(viewAll);
    expect(onNavigateTab).toHaveBeenCalledWith('boosts');
  });

  it('renders the mix percentages rounded', async () => {
    await act(async () => {
      render(withProviders(<SummaryTab {...baseContext({ ratioBar: { p: 60.6, tmp: 39.4 } })} />));
    });
    expect(await screen.findByText('61% / 39%')).toBeInTheDocument();
  });

  it('limits the next-expirations preview to 5 rows', async () => {
    const power = basePower({
      overview: {
        totalHashrate: 1,
        nextExpirations: Array.from({ length: 10 }, (_, i) => ({
          source: 'game',
          slug: `s${i}`,
          name: `Item ${i}`,
          hashRate: 1,
          expiresAt: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
        })),
      },
    });
    await act(async () => {
      render(withProviders(<SummaryTab {...baseContext({ power })} />));
    });
    const items = await screen.findAllByText(/^Item \d$/);
    expect(items.length).toBeLessThanOrEqual(5);
  });
});
