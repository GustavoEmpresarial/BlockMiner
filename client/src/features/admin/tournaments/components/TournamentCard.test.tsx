import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TournamentCard } from './TournamentCard';
import type { AdminTournament } from '../tournaments.admin.types';

const baseTournament: AdminTournament = {
  id: 1,
  name: 'Torneio Diário de Ofertas',
  description: 'Pontue fazendo ofertas',
  type: 'DAILY',
  metric: 'OFFERS_ALL',
  startsAt: '2026-09-25T00:00:00.000Z',
  endsAt: '2026-09-26T00:00:00.000Z',
  status: 'ACTIVE',
  recurring: true,
  _count: { entries: 15 },
  prizes: [
    { rankFrom: 1, rankTo: 1, prizeType: 'POL', polAmount: 100 },
    { rankFrom: 2, rankTo: 5, prizeType: 'BLK', blkAmount: 500 },
  ],
};

describe('TournamentCard component', () => {
  const onInspect = vi.fn();
  const onEdit = vi.fn();
  const onFinalize = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders tournament information, type badge, status badge and metric', () => {
    render(
      <TournamentCard
        tournament={baseTournament}
        onInspect={onInspect}
        onEdit={onEdit}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Torneio Diário de Ofertas')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Diário')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Recorrente')).toBeInTheDocument();
    expect(screen.getByText('OFFERS_ALL')).toBeInTheDocument();
    expect(screen.getByText(/15 participantes/i)).toBeInTheDocument();
    expect(screen.getByText(/2 faixas de prêmio/i)).toBeInTheDocument();
  });

  it('calls onInspect when inspect button is clicked', async () => {
    render(
      <TournamentCard
        tournament={baseTournament}
        onInspect={onInspect}
        onEdit={onEdit}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />,
    );

    const inspectBtn = screen.getByRole('button', { name: /inspecionar torneio/i });
    await userEvent.click(inspectBtn);

    expect(onInspect).toHaveBeenCalledWith(baseTournament);
  });

  it('calls onEdit when edit button is clicked on editable tournament', async () => {
    render(
      <TournamentCard
        tournament={baseTournament}
        onInspect={onInspect}
        onEdit={onEdit}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />,
    );

    const editBtn = screen.getByRole('button', { name: /editar torneio/i });
    await userEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledWith(baseTournament);
  });

  it('shows inline confirmation when Finalizar is clicked and executes onFinalize on confirm', async () => {
    render(
      <TournamentCard
        tournament={baseTournament}
        onInspect={onInspect}
        onEdit={onEdit}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />,
    );

    const finalizeBtn = screen.getByRole('button', { name: /finalizar torneio/i });
    await userEvent.click(finalizeBtn);

    expect(screen.getByText('Finalizar e premiar vencedores?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Sim, finalizar' });
    await userEvent.click(confirmBtn);

    expect(onFinalize).toHaveBeenCalledWith(baseTournament);
  });

  it('shows inline confirmation when Cancelar is clicked and dismisses when Voltar is clicked', async () => {
    render(
      <TournamentCard
        tournament={baseTournament}
        onInspect={onInspect}
        onEdit={onEdit}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: /cancelar torneio/i });
    await userEvent.click(cancelBtn);

    expect(screen.getByText('Cancelar este torneio?')).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: 'Voltar' });
    await userEvent.click(backBtn);

    expect(screen.queryByText('Cancelar este torneio?')).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not render edit, finalize or cancel buttons for ended tournaments', () => {
    const endedTournament: AdminTournament = {
      ...baseTournament,
      status: 'ENDED',
    };

    render(
      <TournamentCard
        tournament={endedTournament}
        onInspect={onInspect}
        onEdit={onEdit}
        onFinalize={onFinalize}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('Encerrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inspecionar torneio/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar torneio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finalizar torneio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancelar torneio/i })).not.toBeInTheDocument();
  });
});
