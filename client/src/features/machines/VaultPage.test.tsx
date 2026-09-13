import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { AxiosError } from 'axios';
import ptBR from '../../i18n/locales/pt-BR.json';

const api = {
  postRetrieveFromVault: vi.fn(),
};
vi.mock('./lib/machines.api', () => api);

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchVault = vi.fn();
const fetchMachines = vi.fn();
const fetchInventory = vi.fn();
let storeState = {
  vaultItems: [] as unknown[],
  vaultLoading: false,
  vaultError: null as string | null,
};
vi.mock('../shell/lib/game.store', () => ({
  useGameStore: (selector: (s: typeof storeState & { fetchVault: typeof fetchVault; fetchMachines: typeof fetchMachines; fetchInventory: typeof fetchInventory }) => unknown) =>
    selector({ ...storeState, fetchVault, fetchMachines, fetchInventory }),
}));

vi.mock('./components/machines.quantityModal', () => ({
  MachineQuantityModal: (props: Record<string, unknown>) =>
    props.open ? (
      <div data-testid="qty-modal">
        <button type="button" onClick={() => (props.onConfirm as (q: number) => void)(2)}>
          do-confirm-qty
        </button>
        <button type="button" onClick={() => (props.onClose as () => void)()}>
          do-close-modal
        </button>
      </div>
    ) : null,
}));

vi.mock('./components/MachineImage', () => ({
  MachineImage: () => <div data-testid="machine-image" />,
}));

const i18n = i18next.createInstance();

async function mount() {
  const { default: VaultPage } = await import('./VaultPage');
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <VaultPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function vaultRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    minerId: 10,
    minerName: 'HyperDrill',
    level: 1,
    hashRate: 1500,
    slotSize: 1,
    imageUrl: '/media/miners/1.webp',
    ...overrides,
  };
}

beforeEach(async () => {
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
  vi.clearAllMocks();
  storeState = { vaultItems: [], vaultLoading: false, vaultError: null };
});

afterEach(() => {
  cleanup();
});

describe('VaultPage — initial load', () => {
  it('calls fetchVault on mount', async () => {
    await mount();
    expect(fetchVault).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while vaultLoading and no items yet', async () => {
    storeState = { vaultItems: [], vaultLoading: true, vaultError: null };
    await mount();
    expect(screen.getByText('Carregando cofre...')).toBeInTheDocument();
  });

  it('shows an error state with a retry button when vaultError is set and no items loaded', async () => {
    storeState = { vaultItems: [], vaultLoading: false, vaultError: 'NETWORK' };
    await mount();
    expect(screen.getByText('Erro ao carregar cofre.')).toBeInTheDocument();
    const retryBtn = screen.getByText('Tentar novamente');
    fireEvent.click(retryBtn);
    await waitFor(() => expect(fetchVault).toHaveBeenCalledTimes(2));
  });

  it('retry button is a no-op re-entrancy guard while a fetch is already in flight', async () => {
    let resolveFetch: (() => void) | undefined;
    fetchVault.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    storeState = { vaultItems: [], vaultLoading: false, vaultError: 'NETWORK' };
    await mount();
    const retryBtn = screen.getByText('Tentar novamente');
    fireEvent.click(retryBtn);
    fireEvent.click(retryBtn);
    // Only the mount-time call + one retry click should have gone through — the
    // second click is swallowed by fetchVaultLock while the first is still pending.
    expect(fetchVault).toHaveBeenCalledTimes(2);
    resolveFetch?.();
  });

  it('shows the empty state when there are no vault rows', async () => {
    await mount();
    expect(screen.getByText('Seu cofre está vazio.')).toBeInTheDocument();
    const cta = screen.getByText('Ir para a Sala de Mineração');
    fireEvent.click(cta);
    expect(navigate).toHaveBeenCalledWith('/inventory');
  });

  it('filters out malformed rows (missing/invalid id) before rendering', async () => {
    storeState = {
      vaultItems: [vaultRow({ id: 1 }), { id: 'not-a-number' }, { id: 0 }, null, 'garbage'],
      vaultLoading: false,
      vaultError: null,
    };
    await mount();
    expect(screen.getByText('HyperDrill')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Máquinas Armazenadas (1)')).toBeTruthy();
  });
});

describe('VaultPage — navigation', () => {
  it('the header "back to mining room" button navigates to /inventory', async () => {
    storeState = { vaultItems: [vaultRow()], vaultLoading: false, vaultError: null };
    await mount();
    fireEvent.click(screen.getByText('Voltar à Sala de Mineração'));
    expect(navigate).toHaveBeenCalledWith('/inventory');
  });
});

describe('VaultPage — grouping and rendering', () => {
  it('groups identical machines into one card with a quantity badge', async () => {
    storeState = {
      vaultItems: [vaultRow({ id: 1 }), vaultRow({ id: 2 })],
      vaultLoading: false,
      vaultError: null,
    };
    await mount();
    expect(screen.getAllByText('HyperDrill')).toHaveLength(1);
    expect(screen.getByText('x2')).toBeInTheDocument();
  });

  it('does not show a quantity badge for a single-unit group', async () => {
    storeState = { vaultItems: [vaultRow({ id: 1 })], vaultLoading: false, vaultError: null };
    await mount();
    expect(screen.queryByText(/^x\d+$/)).not.toBeInTheDocument();
  });
});

describe('VaultPage — retrieve from vault flow', () => {
  it('opens the quantity modal when clicking retrieve, and retrieving calls the API with the right ids', async () => {
    api.postRetrieveFromVault.mockResolvedValue({ data: { ok: true } });
    storeState = {
      vaultItems: [vaultRow({ id: 5 })],
      vaultLoading: false,
      vaultError: null,
    };
    await mount();
    fireEvent.click(screen.getByText('Retirar do Cofre'));
    expect(screen.getByTestId('qty-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('do-confirm-qty'));
    await waitFor(() => expect(api.postRetrieveFromVault).toHaveBeenCalledWith({ destination: 'inventory', vaultIds: [5] }));
    await waitFor(() => expect(fetchVault).toHaveBeenCalled());
    await waitFor(() => expect(fetchMachines).toHaveBeenCalled());
    await waitFor(() => expect(fetchInventory).toHaveBeenCalled());
  });

  it('closing the modal clears the pending group without calling the API', async () => {
    storeState = { vaultItems: [vaultRow({ id: 5 })], vaultLoading: false, vaultError: null };
    await mount();
    fireEvent.click(screen.getByText('Retirar do Cofre'));
    fireEvent.click(screen.getByText('do-close-modal'));
    expect(screen.queryByTestId('qty-modal')).not.toBeInTheDocument();
    expect(api.postRetrieveFromVault).not.toHaveBeenCalled();
  });

  it('shows a translated error toast for a known API error code', async () => {
    const { toast } = await import('sonner');
    const err = new AxiosError('conflict', 'ERR', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {} as never,
      data: { code: 'VAULT_NOT_FOUND' },
    });
    api.postRetrieveFromVault.mockRejectedValue(err);
    storeState = { vaultItems: [vaultRow({ id: 5 })], vaultLoading: false, vaultError: null };
    await mount();
    fireEvent.click(screen.getByText('Retirar do Cofre'));
    fireEvent.click(screen.getByText('do-confirm-qty'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('falls back to a generic error toast when the API error has no translatable code', async () => {
    const { toast } = await import('sonner');
    api.postRetrieveFromVault.mockRejectedValue(new Error('network down'));
    storeState = { vaultItems: [vaultRow({ id: 5 })], vaultLoading: false, vaultError: null };
    await mount();
    fireEvent.click(screen.getByText('Retirar do Cofre'));
    fireEvent.click(screen.getByText('do-confirm-qty'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('logs a structured vault error (not just a bare console.error) when retrieval fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api.postRetrieveFromVault.mockRejectedValue(new Error('boom'));
    storeState = { vaultItems: [vaultRow({ id: 5 })], vaultLoading: false, vaultError: null };
    await mount();
    fireEvent.click(screen.getByText('Retirar do Cofre'));
    fireEvent.click(screen.getByText('do-confirm-qty'));
    await waitFor(() =>
      expect(errSpy).toHaveBeenCalledWith('[vault]', expect.objectContaining({ code: 'VAULT_RETRIEVE_FAILED' })),
    );
    errSpy.mockRestore();
  });

  it('a bulk retrieve (quantity > 1) sends all selected ids, sorted, capped at group size', async () => {
    api.postRetrieveFromVault.mockResolvedValue({ data: { ok: true } });
    storeState = {
      vaultItems: [vaultRow({ id: 3 }), vaultRow({ id: 1 }), vaultRow({ id: 2 })],
      vaultLoading: false,
      vaultError: null,
    };
    await mount();
    fireEvent.click(screen.getByText('Retirar do Cofre'));
    fireEvent.click(screen.getByText('do-confirm-qty')); // mocked modal always confirms qty=2
    await waitFor(() =>
      expect(api.postRetrieveFromVault).toHaveBeenCalledWith({ destination: 'inventory', vaultIds: [1, 2] }),
    );
  });
});
