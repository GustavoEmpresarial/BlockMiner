import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TournamentPrizeEditor } from './TournamentPrizeEditor';
import type { PrizeDraft } from '../tournaments.admin.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      if (k === 'adminTournaments.prizes') return 'Prêmios';
      if (k === 'adminTournaments.add_prize') return 'Faixa';
      if (k === 'adminTournaments.prizes_empty') return 'Nenhuma faixa de prêmio';
      if (k === 'adminTournaments.rank_from') return 'Rank de';
      if (k === 'adminTournaments.rank_to') return 'Rank até';
      if (k === 'adminTournaments.prize_type') return 'Tipo de prêmio';
      if (k === 'adminTournaments.pol_amount') return 'Quantidade POL';
      if (k === 'adminTournaments.blk_amount') return 'Quantidade BLK';
      if (k === 'adminTournaments.boost_hashrate') return 'Poder H/s';
      if (k === 'adminTournaments.boost_hours') return 'Duração Horas';
      return k;
    },
  }),
}));

vi.mock('../tournaments.admin.api', () => ({
  tournamentsAdminApi: {
    searchMiners: vi.fn().mockResolvedValue({ data: { ok: true, miners: [] } }),
  },
}));

describe('TournamentPrizeEditor component', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders empty message when no prizes are configured', () => {
    render(<TournamentPrizeEditor prizes={[]} onChange={onChange} />);

    expect(screen.getByText('Nenhuma faixa de prêmio')).toBeInTheDocument();
  });

  it('calls onChange with a new prize when clicking Faixa', async () => {
    render(<TournamentPrizeEditor prizes={[]} onChange={onChange} />);

    const addBtn = screen.getByRole('button', { name: /faixa/i });
    await userEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        rankFrom: 1,
        rankTo: 1,
        prizeType: 'POL',
      }),
    ]);
  });

  it('renders configured prizes with rank from and rank to inputs', () => {
    const prizes: PrizeDraft[] = [
      {
        key: 'p1',
        rankFrom: 1,
        rankTo: 1,
        prizeType: 'POL',
        polAmount: '100',
        blkAmount: '',
        boostHashRate: '',
        boostHours: '',
        minerId: null,
        minerName: '',
        minerImageUrl: null,
        minerCount: '1',
      },
    ];

    render(<TournamentPrizeEditor prizes={prizes} onChange={onChange} />);

    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('1').length).toBe(2);
  });
});
