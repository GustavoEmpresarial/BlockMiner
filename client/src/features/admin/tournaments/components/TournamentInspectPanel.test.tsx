import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TournamentInspectPanel } from './TournamentInspectPanel';
import type { AdminTournament } from '../tournaments.admin.types';

const mockTournament: AdminTournament = {
  id: 1,
  name: 'Torneio Inspect Teste',
  description: 'Detalhes completos do torneio',
  type: 'DAILY',
  metric: 'OFFERS_ALL',
  startsAt: '2026-09-25T00:00:00.000Z',
  endsAt: '2026-09-26T00:00:00.000Z',
  status: 'ACTIVE',
  recurring: true,
  prizes: [
    { rankFrom: 1, rankTo: 1, prizeType: 'POL', polAmount: 100 },
  ],
};

const mockEntries = [
  { id: 101, score: 50, rank: 1, user: { id: 1, username: 'player_one' } },
  { id: 102, score: 30, rank: 2, user: { id: 2, username: 'player_two' } },
];

vi.mock('../tournaments.admin.api', () => ({
  tournamentsAdminApi: {
    entries: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: {
          ok: true,
          entries: mockEntries,
          total: 2,
          page: 1,
        },
      }),
    ),
    finalize: vi.fn().mockResolvedValue({
      data: { ok: true, ranked: 2, rewarded: 1 },
    }),
    cancel: vi.fn().mockResolvedValue({
      data: { ok: true },
    }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      if (k === 'adminTournaments.close') return 'Fechar';
      if (k === 'adminTournaments.window') return 'Janela';
      if (k === 'adminTournaments.prizes') return 'Prêmios';
      if (k === 'adminTournaments.entries') return 'Leaderboard';
      if (k === 'adminTournaments.player') return 'Jogador';
      if (k === 'adminTournaments.score') return 'Score';
      if (k === 'adminTournaments.finalize') return 'Finalizar';
      if (k === 'adminTournaments.cancel') return 'Cancelar';
      return k;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('TournamentInspectPanel component', () => {
  const onClose = vi.fn();
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders tournament name, ID, prizes and loads leaderboard entries', async () => {
    render(
      <TournamentInspectPanel
        tournament={mockTournament}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );

    expect(screen.getByText('Torneio Inspect Teste')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#1: 100 POL')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('player_one')).toBeInTheDocument();
      expect(screen.getByText('player_two')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });
  });

  it('calls onClose when close X button is clicked', async () => {
    render(
      <TournamentInspectPanel
        tournament={mockTournament}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );

    const closeButtons = screen.getAllByRole('button');
    // The top-right X button
    await userEvent.click(closeButtons[1]);

    expect(onClose).toHaveBeenCalled();
  });

  it('shows inline confirm on Finalizar click and executes finalize API', async () => {
    render(
      <TournamentInspectPanel
        tournament={mockTournament}
        onClose={onClose}
        onChanged={onChanged}
      />,
    );

    const finalizeBtn = screen.getByRole('button', { name: 'Finalizar' });
    await userEvent.click(finalizeBtn);

    expect(
      screen.getByText(/Finalizar torneio e distribuir prêmios agora\?/i),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Sim, finalizar' });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
