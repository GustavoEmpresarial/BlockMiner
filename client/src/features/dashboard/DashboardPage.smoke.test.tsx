import '@testing-library/jest-dom/vitest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

// Real end-to-end-ish smoke test for DashboardPage: every REST call the page makes
// (mining cycle, wallet balance, rooms slots, withdraw-fee-info, banners, energy-tax
// summary) is mocked at the axios layer so we can drive both the happy path and every
// call failing at once — the exact case that used to be a silent `.catch(() => {})`
// with zero observability (see lib/dashboard.errors.ts).

const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
vi.mock('../../shared/auth/auth.store', () => ({
  api,
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: { id: 42, name: 'Gustavo', refCode: 'REF42' },
      checkSession: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('../shell/lib/game.store', () => ({
  useGameStore: (selector: (s: unknown) => unknown) =>
    selector({ initSocket: vi.fn(), stats: null }),
}));

function okCyclePayload() {
  return {
    ok: true,
    blockReward: 10,
    blockRewardShib: 100,
    blockIntervalMinutes: 10,
    blockCountdownSeconds: 300,
    networkHashRate: 1000,
    tokenSymbol: 'BLK',
    blockHistory: [],
    miner: { estimatedHashRate: 100, miningAllocationPolBps: 10000, referralCount: 2 },
  };
}

function installHappyApiMock() {
  api.get.mockImplementation(async (url: string) => {
    if (url === '/mining/cycle') return { data: okCyclePayload() };
    if (url === '/wallet/balance') return { data: { ok: true, balance: 1.23, blkBalance: 4, shibBalance: 5 } };
    if (url === '/rooms/slots') return { data: { ok: true, freeRacks: 2, inventoryCount: 3 } };
    if (url === '/wallet/withdraw-fee-info')
      return { data: { ok: true, completionsToday: 3, requiredForWaiver: 10, feeWaived: false, feeAlreadyChargedToday: false } };
    if (url === '/banners') return { data: { ok: true, banners: [] } };
    if (url === '/energy-tax/summary') return { data: { ok: true, active: false } };
    return { data: { ok: true } };
  });
}

function installAllFailingApiMock() {
  const fail = () => Promise.reject(new Error('network down'));
  api.get.mockImplementation(fail);
}

const i18n = i18next.createInstance();

async function mountPage() {
  const { default: DashboardPage } = await import('./DashboardPage');
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('DashboardPage — happy path', () => {
  it('renders the welcome header and balance cards once all requests resolve', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => {
      expect(screen.getByText(/Gustavo/)).toBeInTheDocument();
    });
    expect(screen.getByText('BLK')).toBeInTheDocument();
  });
});

describe('DashboardPage — every REST call failing', () => {
  it('still renders the page shell instead of crashing, and logs each failure', async () => {
    installAllFailingApiMock();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => {
      expect(screen.getByText(/Gustavo/)).toBeInTheDocument();
    });
    // Balance/racks/etc. degrade to their empty defaults rather than throwing.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    const codes = errorSpy.mock.calls
      .filter((call) => call[0] === '[dashboard]')
      .map((call) => (call[1] as { code?: string })?.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'DASHBOARD_CYCLE_FETCH_FAILED',
        'DASHBOARD_BALANCE_FETCH_FAILED',
        'DASHBOARD_SLOTS_FETCH_FAILED',
        'DASHBOARD_FEE_INFO_FETCH_FAILED',
      ]),
    );
  });
});
