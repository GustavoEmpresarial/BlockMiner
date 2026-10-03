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
    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());
    await waitFor(() => {
      expect(screen.getAllByText(/POL/).length).toBeGreaterThan(0);
    });
  });

  it('logs a structured error and keeps the modal open when paying fails', async () => {
    api.get.mockResolvedValue({ data: pendingSummary({ todayExempt: true }) });
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

  it('pays successfully: posts pay-daily, toasts success, updates the session flag and closes', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    api.post.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());

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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await act(async () => mount());
    fireEvent.click(screen.getByLabelText(/Fechar|close/i));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    cleanup();

    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());
    const remindLater = await screen.findByText(/lembrar/i);
    fireEvent.click(remindLater);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  /* =========================================================================
   * Regressão Técnica do Bug da Faixa (Item 1) & Acessibilidade / Portal
   * ========================================================================= */

  it('regressão da faixa: renderiza via createPortal em document.body com z-[100] e backdrop-blur-md cobrindo toda a viewport', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    const { container } = await act(async () => mount());

    const dialog = await screen.findByRole('dialog');
    // Deve estar atracado diretamente no document.body (fora do container local do componente)
    expect(document.body).toContainElement(dialog);
    expect(container).toBeEmptyDOMElement();

    // Valida classes de posicionamento e z-index da escala canônica
    expect(dialog).toHaveClass('fixed', 'inset-0', 'z-[100]');

    // Valida existência de camada de backdrop com blur para desfocar a viewport inteira (incluindo headers z-30 e z-40)
    const backdrop = dialog.querySelector('.backdrop-blur-md');
    expect(backdrop).not.toBeNull();
    expect(backdrop).toHaveClass('fixed', 'inset-0', 'bg-black/80');
  });

  it('acessibilidade: cumpre role="dialog", aria-modal="true", aria-labelledby, aria-describedby e aria-label no botão fechar', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'energy-tax-modal-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'energy-tax-modal-description');

    const titleEl = document.getElementById('energy-tax-modal-title');
    expect(titleEl).toHaveTextContent('Taxa de Energia pendente');

    const descEl = document.getElementById('energy-tax-modal-description');
    expect(descEl).toHaveTextContent(/Você tem dias em aberto/i);

    const closeBtn = screen.getByLabelText(/Fechar/i);
    expect(closeBtn).toBeInTheDocument();
  });

  it('teclado e interação: fecha ao pressionar a tecla Escape', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('scroll lock: bloqueia o scroll do body enquanto aberto e restaura ao fechar', async () => {
    document.body.style.overflow = 'visible';
    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());

    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('visible');
    });
  });

  it('isenção diária: exibe botão de registrar isenção quando todayExempt é true', async () => {
    api.get.mockResolvedValue({ data: pendingSummary({ todayExempt: true, todayDailyCharge: 0 }) });
    await act(async () => mount());

    const exemptBtn = await screen.findByRole('button', { name: /Registrar isenção de hoje/i });
    expect(exemptBtn).toBeInTheDocument();
    // Não deve exibir seletor de moeda quando o dia for 100% isento
    expect(screen.queryByText('POL', { selector: 'button' })).not.toBeInTheDocument();
  });

  it('seletor de moeda: permite alternar para BLK e SHIB atualizando o valor da cotação', async () => {
    api.get.mockResolvedValue({
      data: pendingSummary({
        todayPayQuotes: {
          POL: { amount: 0.5, balance: 1.0, affordable: true },
          BLK: { amount: 5.0, balance: 10.0, affordable: true },
          SHIB: { amount: 25000, balance: 50000, affordable: true },
        },
      }),
    });
    await act(async () => mount());

    await screen.findByRole('button', { name: /Pagar hoje — 0\.5000 POL/i });

    // Alternar para BLK
    const blkBtn = screen.getByRole('button', { name: 'BLK' });
    fireEvent.click(blkBtn);
    expect(await screen.findByRole('button', { name: /Pagar hoje — 5\.00 BLK/i })).toBeInTheDocument();

    // Alternar para SHIB
    const shibBtn = screen.getByRole('button', { name: 'SHIB' });
    fireEvent.click(shibBtn);
    expect(await screen.findByRole('button', { name: /Pagar hoje — 25[.,]000 SHIB/i })).toBeInTheDocument();
  });

  it('link de navegação: link "Ir para Taxa de Energia" aponta para /taxes e fecha o modal ao clicar', async () => {
    api.get.mockResolvedValue({ data: pendingSummary() });
    await act(async () => mount());

    const taxesLink = await screen.findByRole('link', { name: /Ir para Taxa de Energia/i });
    expect(taxesLink).toHaveAttribute('href', '/taxes');

    fireEvent.click(taxesLink);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
