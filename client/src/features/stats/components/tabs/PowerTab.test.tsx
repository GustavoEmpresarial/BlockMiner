import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import PowerTab from './PowerTab';
import { withProviders, baseContext, basePower } from './testHelpers';

afterEach(() => cleanup());

describe('PowerTab', () => {
  it('renders the four KPI cards without throwing on an empty overview', async () => {
    await act(async () => {
      render(withProviders(<PowerTab {...baseContext({ power: basePower({ overview: {} }) })} />));
    });
    expect(await screen.findAllByText('0 H/s')).not.toHaveLength(0);
  });

  it('computes avgBoost as temporaryHashrate/tempCount when there are pending expirations', async () => {
    const power = basePower({
      overview: {
        totalHashrate: 100,
        permanentHashrate: 60,
        temporaryHashrate: 40,
        nextExpirations: [{ source: 'a' }, { source: 'b' }],
      },
    });
    await act(async () => {
      render(withProviders(<PowerTab {...baseContext({ power })} />));
    });
    expect(await screen.findByText('20.00 H/s')).toBeInTheDocument();
  });

  it('falls back to full temporaryHashrate as avgBoost when there are no pending expirations', async () => {
    const power = basePower({
      overview: { totalHashrate: 100, permanentHashrate: 60, temporaryHashrate: 40, nextExpirations: [] },
    });
    await act(async () => {
      render(withProviders(<PowerTab {...baseContext({ power })} />));
    });
    expect(await screen.findAllByText('40.00 H/s')).not.toHaveLength(0);
  });

  it('renders projection hint keys as a list', async () => {
    const power = basePower({ projections: { permanentHashrate: 1, temporaryRemainingHashrate: 1, hintKeys: ['powerStats.mix'] } });
    await act(async () => {
      render(withProviders(<PowerTab {...baseContext({ power })} />));
    });
    expect((await screen.findAllByRole('listitem')).length).toBeGreaterThan(0);
  });
});
