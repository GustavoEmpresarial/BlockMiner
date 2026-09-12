import '@testing-library/jest-dom/vitest';
import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import MachinesTab from './MachinesTab';
import { withProviders, baseContext, basePower } from './testHelpers';

afterEach(() => cleanup());

describe('MachinesTab', () => {
  it('renders with zero machines without throwing', async () => {
    await act(async () => {
      render(withProviders(<MachinesTab {...baseContext()} />));
    });
    expect(await screen.findAllByText('0')).not.toHaveLength(0);
  });

  it('renders a table row per machine, and a room label when set', async () => {
    const power = basePower({
      machines: {
        items: [
          { id: 1, minerName: 'Rig A', hashRate: 10, isActive: true, roomNumber: 2, rackPosition: 3 },
          { id: 2, minerName: 'Rig B', hashRate: 5, isActive: false, roomNumber: null, rackPosition: null },
        ],
        activeCount: 1,
        inactiveCount: 1,
      },
    });
    await act(async () => {
      render(withProviders(<MachinesTab {...baseContext({ power })} />));
    });
    expect(await screen.findByText('Rig A')).toBeInTheDocument();
    expect(screen.getByText('Rig B')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('does not divide by zero when total hashrate is 0', async () => {
    const power = basePower({ overview: { totalHashrate: 0, permanentHashrate: 0, temporaryHashrate: 0, nextExpirations: [] } });
    await act(async () => {
      render(withProviders(<MachinesTab {...baseContext({ power })} />));
    });
    expect(await screen.findByText('0%')).toBeInTheDocument();
  });
});
