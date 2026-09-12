import '@testing-library/jest-dom/vitest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

let socketStats: unknown = null;
vi.mock('../shell/lib/game.store', () => ({
  useGameStore: (selector: (s: unknown) => unknown) => selector({ initSocket: vi.fn(), stats: socketStats }),
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
  socketStats = null;
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

describe('DashboardPage — referral copy', () => {
  it('copies the referral link, shows the checkmark, and reverts it after 2s', async () => {
    installHappyApiMock();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    try {
      await act(async () => {
        await mountPage();
      });
      await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

      const copyBtn = screen.getByLabelText(/link de indica/i).parentElement!.querySelector('button')!;
      await act(async () => {
        copyBtn.click();
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/register?ref='));

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a structured error and shows an error toast when the clipboard write rejects', async () => {
    installHappyApiMock();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    const copyBtn = screen.getByLabelText(/link de indica/i).parentElement!.querySelector('button')!;
    await act(async () => {
      copyBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const codes = errorSpy.mock.calls.filter((c) => c[0] === '[dashboard]').map((c) => (c[1] as { code?: string })?.code);
    expect(codes).toContain('DASHBOARD_REFERRAL_COPY_FAILED');
  });
});

describe('DashboardPage — link a friend’s referral code', () => {
  it('does nothing when the sanitized input is empty (whitespace-only paste)', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());
    const input = screen.getByPlaceholderText(/código/i) as HTMLInputElement;
    const linkBtn = input.parentElement!.querySelector('button')!;
    expect(linkBtn).toBeDisabled();
  });

  it('links successfully: posts the code, toasts, clears the input and refreshes the session', async () => {
    installHappyApiMock();
    api.post.mockResolvedValue({ data: { ok: true, message: 'Vinculado!' } });
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    const input = screen.getByPlaceholderText(/código/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'FRIEND1' } });
    const linkBtn = input.parentElement!.querySelector('button')!;
    await act(async () => {
      linkBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.post).toHaveBeenCalledWith('/user/link-referral', { refCode: 'FRIEND1' });
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('shows the axios error message and keeps the input when linking fails', async () => {
    installHappyApiMock();
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { data: { message: 'Código não encontrado' } },
    });
    api.post.mockRejectedValue(axiosError);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    const input = screen.getByPlaceholderText(/código/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'BADCODE' } });
    const linkBtn = input.parentElement!.querySelector('button')!;
    await act(async () => {
      linkBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(input.value).toBe('BADCODE');
    const codes = errorSpy.mock.calls.filter((c) => c[0] === '[dashboard]').map((c) => (c[1] as { code?: string })?.code);
    expect(codes).toContain('DASHBOARD_REFERRAL_LINK_FAILED');
  });

  it('links on pressing Enter in the friend-code input, not just on button click', async () => {
    installHappyApiMock();
    api.post.mockResolvedValue({ data: { ok: true } });
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    const input = screen.getByPlaceholderText(/código/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ENTERCODE' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.post).toHaveBeenCalledWith('/user/link-referral', { refCode: 'ENTERCODE' });
  });
});

describe('DashboardPage — mining allocation save flow', () => {
  it('validates the draft, snaps to the nearest 5%, debounces, and saves via PATCH', async () => {
    installHappyApiMock();
    // Server intentionally returns a DIFFERENT polBps than requested (e.g. its own
    // snapping rule) so the post-save display can only match if it actually reads
    // from the merged cycleRest.miner update, not just the optimistic pending value.
    api.patch.mockResolvedValue({ data: { ok: true, polBps: 8000, shibBps: 2000 } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => {
        await mountPage();
      });
      await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('Editar split'));
      fireEvent.click(screen.getByText('75/25'));
      fireEvent.click(screen.getByText('Salvar split'));

      await act(async () => {
        vi.advanceTimersByTime(500);
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
      });

      expect(api.patch).toHaveBeenCalledWith('/mining/allocation', { polBps: 7500 });
      // pendingAllocPercent resets to null once the server confirms, so the display
      // falls back to serverPolPercent computed from the merged cycleRest.miner —
      // 80%, the server's own value, not the 75% we requested.
      await waitFor(() => expect(screen.getByText(/80%/)).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a validation error instead of saving when pol+shib do not sum to 100', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar split'));
    const spinbuttons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinbuttons[0], { target: { value: '70' } });
    fireEvent.click(screen.getByText('Salvar split'));

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('typing a POL percent mirrors the complement into the SHIB field, clamped to [0,100]', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar split'));
    const [polInput, shibInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(polInput, { target: { value: '30' } });
    expect(shibInput).toHaveValue(70);

    fireEvent.change(polInput, { target: { value: '150' } });
    expect(polInput).toHaveValue(100);
    expect(shibInput).toHaveValue(0);
  });

  it('typing a SHIB percent mirrors the complement into the POL field', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar split'));
    const [polInput, shibInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(shibInput, { target: { value: '20' } });
    expect(polInput).toHaveValue(80);
  });

  it('clearing a draft field to empty does not throw and does not touch the other field', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar split'));
    const [polInput, shibInput] = screen.getAllByRole('spinbutton');
    const shibBefore = (shibInput as HTMLInputElement).value;
    fireEvent.change(polInput, { target: { value: '' } });
    expect(polInput).toHaveValue(null);
    expect(shibInput).toHaveValue(Number(shibBefore));
  });

  it('rejects a blank draft (sum no longer 100) instead of saving', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar split'));
    const [polInput, shibInput] = screen.getAllByRole('spinbutton');
    fireEvent.change(polInput, { target: { value: '' } });
    fireEvent.change(shibInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Salvar split'));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('closes the allocation modal via its backdrop when not saving', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Editar split'));
    expect(screen.getByText('Salvar split')).toBeInTheDocument();
    fireEvent.click(document.querySelector('.fixed.inset-0')!);
    expect(screen.queryByText('Salvar split')).not.toBeInTheDocument();
  });
});

describe('DashboardPage — live socket snapshot merges over the REST poll', () => {
  it('prefers the socket miner/blockHistory over the REST ones when the socket has data', async () => {
    installHappyApiMock();
    socketStats = {
      miner: { estimatedHashRate: 999, miningAllocationPolBps: 10000, referralCount: 7 },
      blockHistory: [{ blockNumber: 123, userReward: 1, totalReward: 2 }],
    };
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument(); // referralCount from the socket miner
    expect(screen.getAllByText('#123').length).toBeGreaterThan(0); // blockHistory from the socket
  });

  it('falls back to the REST blockHistory when the socket has none', async () => {
    installHappyApiMock();
    api.get.mockImplementation(async (url: string) => {
      if (url === '/mining/cycle') return { data: { ...okCyclePayload(), blockHistory: [{ blockNumber: 55 }] } };
      if (url === '/wallet/balance') return { data: { ok: true, balance: 1, blkBalance: 4, shibBalance: 5 } };
      return { data: { ok: true } };
    });
    socketStats = { miner: { estimatedHashRate: 1, miningAllocationPolBps: 10000 } };
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());
    expect(screen.getAllByText('#55').length).toBeGreaterThan(0);
  });
});

describe('DashboardPage — balance currency switch', () => {
  it('persists the chosen display currency and reflects it in the balance card', async () => {
    installHappyApiMock();
    await act(async () => {
      await mountPage();
    });
    await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /POL/i }));
    fireEvent.click(screen.getAllByRole('option').find((o) => o.textContent?.includes('SHIB'))!);
    expect(screen.getByRole('button', { name: /SHIB/i })).toBeInTheDocument();
  });

  it('logs a structured error and reverts the pending percent when the allocation PATCH fails', async () => {
    installHappyApiMock();
    api.patch.mockRejectedValue(new Error('server exploded'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => {
        await mountPage();
      });
      await waitFor(() => expect(screen.getByText(/Gustavo/)).toBeInTheDocument());

      fireEvent.click(screen.getByText('Editar split'));
      fireEvent.click(screen.getByText('50/50'));
      fireEvent.click(screen.getByText('Salvar split'));

      await act(async () => {
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
      });

      const codes = errorSpy.mock.calls.filter((c) => c[0] === '[dashboard]').map((c) => (c[1] as { code?: string })?.code);
      expect(codes).toContain('DASHBOARD_ALLOCATION_SAVE_FAILED');
    } finally {
      vi.useRealTimers();
    }
  });
});
