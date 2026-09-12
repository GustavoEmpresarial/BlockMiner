import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';

const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
vi.mock('../../../shared/auth/auth.store', () => ({
  api,
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ setUser: vi.fn(), checkSession: vi.fn().mockResolvedValue(undefined) }),
}));

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
});
