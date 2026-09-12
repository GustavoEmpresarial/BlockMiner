import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';

const api = { get: vi.fn() };
const navigate = vi.fn();
vi.mock('../../../shared/auth/auth.store', () => ({ api }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const i18n = i18next.createInstance();

async function mount(farmHashRate = 0) {
  const { Inventory2Distributor } = await import('./Inventory2Distributor');
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Inventory2Distributor farmHashRate={farmHashRate} />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Inventory2Distributor', () => {
  it('shows a loading spinner while the summary is in flight', async () => {
    api.get.mockReturnValue(new Promise(() => {}));
    await act(async () => mount());
    expect(screen.getByText('Distribuidor de energia')).toBeInTheDocument();
    expect(screen.queryByText(/POL$/)).not.toBeInTheDocument();
  });

  it('renders bill/status/activity once the summary resolves (open/unpaid state)', async () => {
    api.get.mockResolvedValue({ data: { todayDailyCharge: 1.5, totalActivitiesToday: 4, unpaidDays: 2 } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText(/POL/)).toBeInTheDocument());
    expect(screen.getByText('Em aberto · 2 dia(s)')).toBeInTheDocument();
    expect(screen.getByText('4/10')).toBeInTheDocument();
  });

  it('shows the paid state', async () => {
    api.get.mockResolvedValue({ data: { todayPaid: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Taxa paga')).toBeInTheDocument());
  });

  it('shows the exempt state (takes priority over paid)', async () => {
    api.get.mockResolvedValue({ data: { todayPaid: true, todayExempt: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Isento hoje')).toBeInTheDocument());
  });

  it('shows a toast and stops loading when the fetch fails', async () => {
    const { toast } = await import('sonner');
    api.get.mockRejectedValue(new Error('network down'));
    await act(async () => mount());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('does not update state when the API resolves with no data (res.data falsy)', async () => {
    api.get.mockResolvedValue({ data: null });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Em aberto · 0 dia(s)')).toBeInTheDocument());
  });

  it('renders the lit farm hashrate badge and lit visual when farmHashRate > 0', async () => {
    api.get.mockResolvedValue({ data: {} });
    await act(async () => mount(1500));
    await waitFor(() => expect(screen.getByText('1.50 KH/s')).toBeInTheDocument());
  });

  it('falls back to the inline SVG mark after the distributor image fails to load', async () => {
    api.get.mockResolvedValue({ data: {} });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByAltText('Gerador de energia da fazenda')).toBeInTheDocument());
    fireEvent.error(screen.getByAltText('Gerador de energia da fazenda'));
    expect(screen.queryByAltText('Gerador de energia da fazenda')).not.toBeInTheDocument();
  });

  it('navigates to /taxes when the button is clicked', async () => {
    api.get.mockResolvedValue({ data: {} });
    await act(async () => mount());
    fireEvent.click(await screen.findByText('Abrir Impostos e Taxas'));
    expect(navigate).toHaveBeenCalledWith('/taxes');
  });
});
