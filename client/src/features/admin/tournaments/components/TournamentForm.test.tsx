import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TournamentForm } from './TournamentForm';
import type { TournamentFormState } from '../tournaments.admin.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      if (k === 'adminTournaments.create_title') return 'Criar torneio';
      if (k === 'adminTournaments.edit_title') return 'Editar torneio';
      if (k === 'adminTournaments.name') return 'Nome';
      if (k === 'adminTournaments.description') return 'Descrição';
      if (k === 'adminTournaments.type') return 'Tipo';
      if (k === 'adminTournaments.metric') return 'Métrica';
      if (k === 'adminTournaments.starts') return 'Início';
      if (k === 'adminTournaments.ends') return 'Fim';
      if (k === 'adminTournaments.recurring') return 'Recorrente';
      if (k === 'adminTournaments.close') return 'Fechar';
      if (k === 'adminTournaments.prizes') return 'Prêmios';
      if (k === 'adminTournaments.add_prize') return 'Faixa';
      if (k === 'adminManaged.create') return 'Criar';
      if (k === 'adminManaged.update') return 'Salvar alterações';
      if (k === 'adminManaged.saving') return 'Salvando...';
      return k;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../tournaments.admin.api', () => ({
  tournamentsAdminApi: {
    searchMiners: vi.fn().mockResolvedValue({ data: { ok: true, miners: [] } }),
  },
}));

const validForm: TournamentFormState = {
  name: 'Torneio Teste',
  description: 'Uma descrição válida',
  type: 'DAILY',
  metric: 'OFFERS_ALL',
  startsAt: '2026-09-25T10:00',
  endsAt: '2026-09-26T10:00',
  recurring: true,
  prizes: [],
};

describe('TournamentForm component', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when open is false', () => {
    render(
      <TournamentForm
        open={false}
        editId={null}
        initial={validForm}
        onSave={onSave}
        onClose={onClose}
        isSaving={false}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders with initial values when open is true', () => {
    render(
      <TournamentForm
        open={true}
        editId={null}
        initial={validForm}
        onSave={onSave}
        onClose={onClose}
        isSaving={false}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Criar torneio')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Torneio Teste')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Uma descrição válida')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    render(
      <TournamentForm
        open={true}
        editId={null}
        initial={validForm}
        onSave={onSave}
        onClose={onClose}
        isSaving={false}
      />,
    );

    const closeButtons = screen.getAllByRole('button', { name: 'Fechar' });
    await userEvent.click(closeButtons[0]);

    expect(onClose).toHaveBeenCalled();
  });

  it('submits form when submit button is clicked with valid data', async () => {
    render(
      <TournamentForm
        open={true}
        editId={null}
        initial={validForm}
        onSave={onSave}
        onClose={onClose}
        isSaving={false}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: 'Criar' });
    await userEvent.click(submitBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Torneio Teste',
        type: 'DAILY',
        metric: 'OFFERS_ALL',
      }),
    );
  });
});
