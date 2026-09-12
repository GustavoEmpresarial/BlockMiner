import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';

const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
const setUser = vi.fn();
const checkSession = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../shared/auth/auth.store', () => ({
  api,
  useAuthStore: (selector: (s: unknown) => unknown) => selector({ setUser, checkSession }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const i18n = i18next.createInstance();

async function mount() {
  const { default: DashboardEnergyTaxModal } = await import('./DashboardEnergyTaxModal');
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <DashboardEnergyTaxModal />
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

describe('DashboardEnergyTaxModal', () => {
  it('stays hidden when the summary fetch fails, and logs the failure', async () => {
    api.get.mockRejectedValue(new Error('energy-tax service down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = await act(async () => mount());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    const codes = errorSpy.mock.calls.filter((c) => c[0] === '[dashboard]').map((c) => (c[1] as { code?: string })?.code);
    expect(codes).toContain('DASHBOARD_ENERGY_TAX_FETCH_FAILED');
  });

  it('stays hidden when there is no active/pending tax', async () => {
    api.get.mockResolvedValue({ data: { ok: true, active: false } });
    const { container } = await act(async () => mount());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('stays hidden when active but unpaidDays is 0', async () => {
    api.get.mockResolvedValue({ data: { ok: true, active: true, unpaidDays: 0 } });
    const { container } = await act(async () => mount());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the pending-tax modal when active with unpaid days', async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        active: true,
        unpaidDays: 2,
        todayDailyCharge: 0.5,
        todayPaid: false,
        todayExempt: false,
        yesterdayRewards: 1,
        fullRateTax: 1,
        dailyRateTax: 0.5,
        totalRewards7d: 5,
      },
    });
    await act(async () => mount());
    await waitFor(() => {
      expect(screen.getAllByText(/POL/).length).toBeGreaterThan(0);
    });
  });

  it('logs a structured error and keeps the modal open when paying fails', async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        active: true,
        unpaidDays: 2,
        todayDailyCharge: 0.5,
        todayPaid: false,
        todayExempt: true,
        yesterdayRewards: 1,
        fullRateTax: 1,
        dailyRateTax: 0.5,
        totalRewards7d: 5,
      },
    });
    api.post.mockRejectedValue(new Error('pay-daily failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => mount());

    const payButton = await screen.findByRole('button', { name: /Registrar|Pagar/i });
    await act(async () => {
      payButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const codes = errorSpy.mock.calls.filter((c) => c[0] === '[dashboard]').map((c) => (c[1] as { code?: string })?.code);
    expect(codes).toContain('DASHBOARD_ENERGY_TAX_PAY_FAILED');
  });

  function pendingSummary(overrides: Record<string, unknown> = {}) {
    return {
      ok: true,
      active: true,
      unpaidDays: 2,
      todayDailyCharge: 0.5,
      todayPaid: false,
      todayExempt: false,
      yesterdayRewards: 1,
      fullRateTax: 1,
      dailyRateTax: 0.5,
      totalRewards7d: 5,
      ...overrides,
    };
  }

  it('pays successfully: posts pay-daily, toasts success, updates the session flag and closes', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    api.post.mockResolvedValue({ data: { ok: true } });
    const { container } = await act(async () => mount());

    const payButton = await screen.findByRole('button', { name: /Pagar/i });
    await act(async () => {
      payButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.post).toHaveBeenCalledWith('/energy-tax/pay-daily', { currency: 'POL' });
    expect(toast.success).toHaveBeenCalled();
    expect(setUser).toHaveBeenCalledWith({ energyHasPendingTax: false });
    expect(checkSession).toHaveBeenCalledWith({ silent: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the axios error response message when pay-daily fails with one', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { data: { message: 'Saldo insuficiente' } },
    });
    api.post.mockRejectedValue(axiosError);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => mount());

    const payButton = await screen.findByRole('button', { name: /Pagar/i });
    await act(async () => {
      payButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.error).toHaveBeenCalledWith('Saldo insuficiente');
  });

  it('shows the already-paid message and no pay button once todayPaid is true', async () => {
    api.get.mockResolvedValue({ data: pendingSummary({ todayPaid: true }) });
    await act(async () => mount());
    await screen.findByText(/já está quitada/i);
    expect(screen.queryByRole('button', { name: /Pagar/i })).not.toBeInTheDocument();
  });

  it('shows the insufficient-balance message instead of a pay button when the quote is unaffordable', async () => {
    api.get.mockResolvedValue({
      data: pendingSummary({
        todayPayQuotes: { POL: { amount: 999, affordable: false } },
      }),
    });
    await act(async () => mount());
    await waitFor(() => expect(screen.queryByRole('button', { name: /Pagar/i })).not.toBeInTheDocument());
    expect(screen.getByText(/saldo insuficiente/i)).toBeInTheDocument();
  });

  it('shows the currency picker only when there is an unpaid, non-exempt balance to choose currency for', async () => {
    api.get.mockResolvedValue({ data: pendingSummary({ todayPayQuotes: { POL: { amount: 0.5, affordable: true } } }) });
    await act(async () => mount());
    await screen.findByRole('button', { name: /Pagar/i });
    expect(screen.getByText('POL', { selector: 'button' })).toBeInTheDocument();
  });

  it('closes via the X button, the backdrop, and "lembrar mais tarde" without calling the API', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    const { container: c1 } = await act(async () => mount());
    fireEvent.click(screen.getByLabelText(/Fechar|close/i));
    expect(c1).toBeEmptyDOMElement();
    cleanup();

    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());
    const remindLater = await screen.findByText(/lembrar/i);
    fireEvent.click(remindLater);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not close when clicking inside the dialog card itself (only the backdrop closes it)', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());
    const heading = await screen.findByText('Taxa de Energia pendente');
    fireEvent.click(heading);
    expect(screen.queryByText('Taxa de Energia pendente')).toBeInTheDocument();
  });

  it('ignores a second payDaily click while the first is still in flight', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    let resolvePost: (v: unknown) => void = () => {};
    api.post.mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));
    await act(async () => mount());

    const payButton = await screen.findByRole('button', { name: /Pagar/i });
    fireEvent.click(payButton);
    fireEvent.click(payButton);
    fireEvent.click(payButton);
    await act(async () => {
      resolvePost({ data: { ok: true } });
      await Promise.resolve();
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
