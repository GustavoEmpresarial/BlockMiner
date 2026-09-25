import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminTournamentsPage from './AdminTournamentsPage';
import type { AdminTournament } from './tournaments.admin.types';

const mockTournamentsList: AdminTournament[] = [
  {
    id: 1,
    name: 'Torneio Ativo Diário',
    type: 'DAILY',
    metric: 'OFFERS_ALL',
    startsAt: '2026-09-25T00:00:00.000Z',
    endsAt: '2026-09-26T00:00:00.000Z',
    status: 'ACTIVE',
    recurring: true,
    _count: { entries: 10 },
    prizes: [],
  },
  {
    id: 2,
    name: 'Torneio Agendado Semanal',
    type: 'WEEKLY',
    metric: 'MINIGAME_WINS',
    startsAt: '2026-09-28T00:00:00.000Z',
    endsAt: '2026-10-05T00:00:00.000Z',
    status: 'SCHEDULED',
    recurring: false,
    _count: { entries: 0 },
    prizes: [],
  },
  {
    id: 3,
    name: 'Torneio Histórico Encerrado',
    type: 'MONTHLY',
    metric: 'FAUCET',
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-09-01T00:00:00.000Z',
    status: 'ENDED',
    recurring: false,
    _count: { entries: 50 },
    prizes: [],
  },
];

const mockList = vi.fn().mockImplementation(() =>
  Promise.resolve({
    data: { ok: true, tournaments: mockTournamentsList },
  }),
);

const mockGetDisplayOrder = vi.fn().mockImplementation(() =>
  Promise.resolve({
    data: { ok: true, typeOrder: ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] },
  }),
);

vi.mock('./tournaments.admin.api', () => ({
  tournamentsAdminApi: {
    list: () => mockList(),
    getDisplayOrder: () => mockGetDisplayOrder(),
    setDisplayOrder: vi.fn().mockResolvedValue({ data: { ok: true } }),
    create: vi.fn().mockResolvedValue({ data: { ok: true } }),
    update: vi.fn().mockResolvedValue({ data: { ok: true } }),
    finalize: vi.fn().mockResolvedValue({ data: { ok: true } }),
    cancel: vi.fn().mockResolvedValue({ data: { ok: true } }),
    entries: vi.fn().mockResolvedValue({ data: { ok: true, entries: [], total: 0 } }),
    searchMiners: vi.fn().mockResolvedValue({ data: { ok: true, miners: [] } }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      if (k === 'adminTournaments.title') return 'Torneios';
      if (k === 'adminTournaments.stat_active') return 'Ativos';
      if (k === 'adminTournaments.stat_scheduled') return 'Agendados';
      if (k === 'adminTournaments.stat_recurring') return 'Séries recorrentes';
      if (k === 'adminTournaments.stat_history') return 'Histórico';
      if (k === 'adminTournaments.tab_live') return 'Ativos / Agendados';
      if (k === 'adminTournaments.tab_history') return 'Histórico';
      if (k === 'adminTournaments.tab_all') return 'Todos';
      if (k === 'adminTournaments.filter_all_types') return 'Todos os tipos';
      if (k === 'adminTournaments.filter_all_metrics') return 'Todas as métricas';
      if (k === 'adminTournaments.presets_title') return 'Torneios base (presets)';
      if (k === 'adminTournaments.preset_daily_offerwall') return 'Daily Offerwall';
      if (k === 'adminTournaments.preset_daily_game') return 'Daily Game';
      if (k === 'adminTournaments.edit_series') return 'Editar série';
      if (k === 'adminTournaments.inspect') return 'Inspecionar';
      if (k === 'adminManaged.create') return 'Novo Torneio';
      if (k === 'adminManaged.empty') return 'Nenhum torneio encontrado';
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

describe('AdminTournamentsPage — Painel de Gestão de Torneios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renderiza o cabeçalho, contadores estatísticos e torneios ao vivo', async () => {
    render(<AdminTournamentsPage />);

    expect(screen.getByText('Torneios')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      expect(screen.getAllByText('Torneio Ativo Diário').length).toBeGreaterThan(0);
      expect(screen.getByText('Torneio Agendado Semanal')).toBeInTheDocument();
      // Ended tournament should not be in the default 'live' tab
      expect(screen.queryByText('Torneio Histórico Encerrado')).not.toBeInTheDocument();
    });

    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('permite alternar para a aba Histórico e visualizar torneios encerrados', async () => {
    render(<AdminTournamentsPage />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      expect(screen.getAllByText('Torneio Ativo Diário').length).toBeGreaterThan(0);
    });

    const historyTab = screen.getByRole('button', { name: 'Histórico' });
    await userEvent.click(historyTab);

    expect(screen.getByText('Torneio Histórico Encerrado')).toBeInTheDocument();
    // In history tab, the tournament cards don't show active tournament
    expect(screen.queryByText('Torneio Agendado Semanal')).not.toBeInTheDocument();
  });

  it('filtra a lista por busca de texto', async () => {
    render(<AdminTournamentsPage />);

    await waitFor(() => {
      expect(screen.queryByText('Carregando…')).not.toBeInTheDocument();
      expect(screen.getAllByText('Torneio Ativo Diário').length).toBeGreaterThan(0);
    });

    const searchInput = screen.getByPlaceholderText('adminTournaments.search_placeholder');
    await userEvent.type(searchInput, 'Agendado');

    await waitFor(() => {
      expect(screen.getByText('Torneio Agendado Semanal')).toBeInTheDocument();
    });
  });

  it('abre a gaveta de presets quando o botão colapsável de presets é clicado', async () => {
    render(<AdminTournamentsPage />);

    const presetsToggle = screen.getByText('Torneios base (presets)');
    await userEvent.click(presetsToggle);

    expect(screen.getByText('Daily Offerwall')).toBeInTheDocument();
    expect(screen.getByText('Daily Game')).toBeInTheDocument();
  });

  it('abre o modal de criação quando o botão Novo Torneio é clicado', async () => {
    render(<AdminTournamentsPage />);

    const newBtn = screen.getByRole('button', { name: /novo torneio/i });
    await userEvent.click(newBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
