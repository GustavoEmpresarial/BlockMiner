import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TournamentSeriesCard } from './TournamentSeriesCard';
import type { AdminTournament } from '../tournaments.admin.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      if (k === 'adminTournaments.edit_series') return 'Editar série';
      if (k === 'adminTournaments.inspect') return 'Inspecionar';
      return k;
    },
  }),
}));

const seriesTournament: AdminTournament = {
  id: 10,
  name: 'Série Recorrente Diária',
  type: 'DAILY',
  metric: 'OFFERS_ALL',
  startsAt: '2026-09-25T00:00:00.000Z',
  endsAt: '2026-09-26T00:00:00.000Z',
  status: 'ACTIVE',
  recurring: true,
  prizes: [],
};

describe('TournamentSeriesCard component', () => {
  const onEdit = vi.fn();
  const onInspect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders series name, ID, type and metric', () => {
    render(
      <TournamentSeriesCard
        tournament={seriesTournament}
        onEdit={onEdit}
        onInspect={onInspect}
      />,
    );

    expect(screen.getByText('Série Recorrente Diária')).toBeInTheDocument();
    expect(screen.getByText('#10')).toBeInTheDocument();
    expect(screen.getByText('Diário')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('OFFERS_ALL')).toBeInTheDocument();
  });

  it('calls onEdit when edit series button is clicked', async () => {
    render(
      <TournamentSeriesCard
        tournament={seriesTournament}
        onEdit={onEdit}
        onInspect={onInspect}
      />,
    );

    const editBtn = screen.getByRole('button', { name: /editar série/i });
    await userEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledWith(seriesTournament);
  });

  it('calls onInspect when inspect button is clicked', async () => {
    render(
      <TournamentSeriesCard
        tournament={seriesTournament}
        onEdit={onEdit}
        onInspect={onInspect}
      />,
    );

    const inspectBtn = screen.getByRole('button', { name: /inspecionar/i });
    await userEvent.click(inspectBtn);

    expect(onInspect).toHaveBeenCalledWith(seriesTournament);
  });
});
