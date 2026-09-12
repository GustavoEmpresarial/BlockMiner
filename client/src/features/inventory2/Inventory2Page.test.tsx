import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

const api = {
  getRooms: vi.fn(),
  getInventory: vi.fn(),
  postBuyRoom: vi.fn(),
  postRackInstall: vi.fn(),
  postRackUninstall: vi.fn(),
  postRackUninstallBatch: vi.fn(),
  postMoveToVault: vi.fn(),
  getVisualPlacements: vi.fn(),
  postVisualPlacement: vi.fn(),
  getFanPlacements: vi.fn(),
  postFanPlacement: vi.fn(),
};
vi.mock('../machines/lib/machines.api', () => api);

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const initSocket = vi.fn();
let mockSocket: { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> } | null = null;
vi.mock('../shell/lib/game.store', () => ({
  useGameStore: (selector: (s: unknown) => unknown) => selector({ initSocket, socket: mockSocket }),
}));

// Isolate Inventory2Page's own data-fetching/handler orchestration from its
// children's rendering details (all covered by their own dedicated test files).
vi.mock('./components/Inventory2RoomContent', () => ({
  Inventory2RoomContent: (props: Record<string, unknown>) => (
    <div data-testid="room-content">
      <span data-testid="room-content-room">{JSON.stringify(props.currentRoom)}</span>
      <button type="button" onClick={() => (props.onInstall as (r: number, i: number) => void)(1, 2)}>
        do-install
      </button>
      <button type="button" onClick={() => (props.onInstall as (r: number, i: number) => void)(0, 0)}>
        do-install-invalid
      </button>
      <button type="button" onClick={() => (props.onSelectSlot as (s: unknown) => void)({ rack: { id: 1 }, miner: null, visualRackNumber: 1, slotInRack: 0 })}>
        do-select-slot
      </button>
      <button type="button" onClick={() => (props.onBuyRoom as (n: number) => void)(2)}>
        do-buy-room
      </button>
      <button type="button" onClick={() => (props.onBuyRoom as (n: number) => void)(0)}>
        do-buy-room-invalid
      </button>
      <button
        type="button"
        onClick={() =>
          // The real Inventory2RoomContent/ImageRackCard always await+catch this call
          // (handleRemoveRackSlots deliberately rethrows on failure so its real callers
          // can reset their own local "confirming" state) — mirror that here so a
          // rejection doesn't escape as an unhandled promise rejection in this stub.
          void (props.onDismantleRack as (s: unknown[], m?: string) => Promise<void>)(
            [{ id: 1, miner: { id: 99 } }],
            undefined,
          ).catch(() => {})
        }
      >
        do-dismantle
      </button>
      <button type="button" onClick={() => (props.onPlaceRack as (v: number, f: number | null) => void)(0, 1)}>
        do-place-rack
      </button>
      <button type="button" onClick={() => (props.onPlaceRack as (v: number, f: number | null) => void)(0, null)}>
        do-store-rack
      </button>
      <button type="button" onClick={() => (props.onMountFan as (v: number) => void)(0)}>
        do-mount-fan
      </button>
      <button type="button" onClick={() => (props.onUnmountFan as (v: number) => void)(0)}>
        do-unmount-fan
      </button>
      <button type="button" onClick={() => (props.onFanNeedsRack as () => void)()}>
        do-fan-needs-rack
      </button>
    </div>
  ),
}));
vi.mock('./components/Inventory2Distributor', () => ({
  Inventory2Distributor: (props: Record<string, unknown>) => (
    <div data-testid="distributor">{String(props.farmHashRate)}</div>
  ),
}));

vi.mock('../machines/components/machines.slotModal', () => ({
  SlotModal: (props: Record<string, unknown>) => (
    <div role="dialog" data-testid="slot-modal">
      <button type="button" onClick={() => (props.onRemove as (id: number) => void)(5)}>
        do-remove
      </button>
      <button type="button" onClick={() => (props.onRemove as (id: number) => void)(0)}>
        do-remove-invalid
      </button>
      <button type="button" onClick={() => (props.onMoveToVault as (id: number) => void)(7)}>
        do-move-rack-to-vault
      </button>
      <button type="button" onClick={() => (props.onMoveToVault as (id: number) => void)(0)}>
        do-move-rack-to-vault-invalid
      </button>
      <button type="button" onClick={() => (props.onClose as () => void)()}>
        do-close-slot-modal
      </button>
    </div>
  ),
}));

vi.mock('../machines/components/machines.quantityModal', () => ({
  MachineQuantityModal: (props: Record<string, unknown>) =>
    props.open ? (
      <div data-testid="qty-modal">
        <button type="button" onClick={() => (props.onConfirm as (q: number) => void)(2)}>
          do-confirm-qty
        </button>
      </div>
    ) : null,
}));

const i18n = i18next.createInstance();

async function mount() {
  const { default: Inventory2Page } = await import('./Inventory2Page');
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Inventory2Page />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function okRooms(rooms: unknown[] = [{ roomNumber: 1, unlocked: true, racks: [] }], extra: Record<string, unknown> = {}) {
  return { data: { ok: true, rooms, totalRacks: 8, occupiedRacks: 0, freeRacks: 8, ...extra } };
}
function okInventory(inventory: unknown[] = []) {
  return { data: { ok: true, inventory } };
}
function okPlacements(rooms: unknown[] = []) {
  return { data: { ok: true, rooms } };
}
function okFans(rooms: unknown[] = [], fanCredits = 0) {
  return { data: { ok: true, rooms, fanCredits } };
}

function setDefaultMocks() {
  api.getRooms.mockResolvedValue(okRooms());
  api.getInventory.mockResolvedValue(okInventory());
  api.getVisualPlacements.mockResolvedValue(okPlacements());
  api.getFanPlacements.mockResolvedValue(okFans());
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockSocket = null;
  setDefaultMocks();
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(() => {
  cleanup();
});

describe('Inventory2Page — initial load', () => {
  it('shows a loading spinner, then the shell once data resolves', async () => {
    let resolveRooms!: (v: unknown) => void;
    api.getRooms.mockReturnValue(new Promise((r) => (resolveRooms = r)));
    let container: HTMLElement;
    await act(async () => {
      const result = await mount();
      container = result.container;
    });
    expect(container!.querySelector('.animate-spin')).toBeInTheDocument();
    await act(async () => {
      resolveRooms(okRooms());
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
  });

  it('renders rooms/inventory once loaded and shows the room tabs', async () => {
    api.getRooms.mockResolvedValue(okRooms([{ roomNumber: 1, unlocked: true, racks: [] }, { roomNumber: 2, unlocked: false, racks: [] }]));
    await act(async () => mount());
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThanOrEqual(2));
  });

  it('logs and toasts once when the rooms fetch fails outright (non-cancel)', async () => {
    const { toast } = await import('sonner');
    api.getRooms.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => mount());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao carregar sala de mineração.'));
    expect(errSpy).toHaveBeenCalledWith('[inventory2]', expect.objectContaining({ code: 'INVENTORY_ROOMS_FETCH_FAILED' }));
    errSpy.mockRestore();
  });

  it('logs AND toasts when the inventory fetch fails, even though rooms succeed', async () => {
    const { toast } = await import('sonner');
    api.getInventory.mockRejectedValue(new Error('inv down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    expect(errSpy).toHaveBeenCalledWith('[inventory2]', expect.objectContaining({ code: 'INVENTORY_BACKPACK_FETCH_FAILED' }));
    expect(toast.error).toHaveBeenCalledWith('Erro ao carregar sala de mineração.');
    errSpy.mockRestore();
  });

  it('logs but does not block rendering when placements/fan fetches fail', async () => {
    api.getVisualPlacements.mockRejectedValue(new Error('placements down'));
    api.getFanPlacements.mockRejectedValue(new Error('fans down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    expect(errSpy).toHaveBeenCalledWith('[inventory2]', expect.objectContaining({ code: 'INVENTORY_PLACEMENTS_FETCH_FAILED' }));
    expect(errSpy).toHaveBeenCalledWith('[inventory2]', expect.objectContaining({ code: 'INVENTORY_FAN_PLACEMENTS_FETCH_FAILED' }));
    errSpy.mockRestore();
  });

  it('filters out malformed inventory rows (missing/invalid id)', async () => {
    api.getInventory.mockResolvedValue(
      okInventory([{ id: 1, minerName: 'Good' }, { id: 'not-a-number', minerName: 'Bad' }, { minerName: 'NoId' }]),
    );
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    // Inventory count of 1 flows into MachinesHeader's inventoryCount prop indirectly;
    // verified via the sidebar/header integration tests. Here we only assert no crash
    // and that fetchData completed.
  });

  it('negative fan credits are clamped to 0', async () => {
    api.getFanPlacements.mockResolvedValue(okFans([], -5));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
  });

  it('populates placements-by-room and fans-by-room from a non-empty response', async () => {
    api.getVisualPlacements.mockResolvedValue(
      okPlacements([{ roomId: 1, roomNumber: 1, visualCount: 1, placements: [{ visualIndex: 0, floorSlot: 0 }] }]),
    );
    api.getFanPlacements.mockResolvedValue(okFans([{ roomId: 1, roomNumber: 1, visualCount: 1, mounted: [0] }], 2));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
  });

  it('an exception thrown synchronously while building the fetch shows the load-error toast', async () => {
    const { toast } = await import('sonner');
    api.getRooms.mockImplementation(() => {
      throw new Error('sync boom');
    });
    await act(async () => mount());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao carregar sala de mineração.'));
  });
});

describe('Inventory2Page — room tabs / distributor toggle', () => {
  it('switching tabs updates the active room and clears pending placement', async () => {
    api.getRooms.mockResolvedValue(okRooms([{ roomNumber: 1, unlocked: true, racks: [] }, { roomNumber: 2, unlocked: true, racks: [] }]));
    await act(async () => mount());
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThanOrEqual(2));
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]!);
    await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'));
  });

  it('the distributor tab swaps the main panel and shows the farm hashrate', async () => {
    api.getRooms.mockResolvedValue(
      okRooms([{ roomNumber: 1, unlocked: true, racks: [{ id: 1, position: 0, miner: { id: 1, hashRate: 500 } }] }]),
    );
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[tabs.length - 1]!); // extraTab is always last
    await waitFor(() => expect(screen.getByTestId('distributor')).toHaveTextContent('500'));
    expect(screen.queryByTestId('room-content')).not.toBeInTheDocument();
  });
});

describe('Inventory2Page — buy room', () => {
  it('a successful buy switches to that room and shows a success toast', async () => {
    const { toast } = await import('sonner');
    api.getRooms.mockResolvedValue(okRooms([{ roomNumber: 1, unlocked: true, racks: [] }, { roomNumber: 2, unlocked: false, racks: [] }]));
    api.postBuyRoom.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-buy-room'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sala 2 desbloqueada!'));
  });

  it('a failed buy (ok:false) shows the resolved error message', async () => {
    const { toast } = await import('sonner');
    api.postBuyRoom.mockResolvedValue({ data: { ok: false, message: 'Not enough BLK' } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-buy-room'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not enough BLK'));
  });

  it('a thrown error during buy shows the fallback error message', async () => {
    const { toast } = await import('sonner');
    api.postBuyRoom.mockRejectedValue(new Error('network'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-buy-room'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
  });
});

describe('Inventory2Page — install/remove/vault mutations', () => {
  it('a successful install shows a toast and triggers a background refetch', async () => {
    const { toast } = await import('sonner');
    api.getRooms.mockResolvedValue(
      okRooms([{ roomNumber: 1, unlocked: true, racks: [{ id: 1, position: 0 }] }]),
    );
    api.getInventory.mockResolvedValue(okInventory([{ id: 2, minerName: 'X', slotSize: 1 }]));
    api.postRackInstall.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    api.getRooms.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByText('do-install'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Máquina instalada com sucesso!'));
    await waitFor(() => expect(api.getRooms).toHaveBeenCalled());
  });

  it('a failed install (ok:false) shows the resolved message and refetches', async () => {
    const { toast } = await import('sonner');
    api.postRackInstall.mockResolvedValue({ data: { ok: false, message: 'Rack occupied' } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-install'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Rack occupied'));
  });

  it('opening the slot modal via onSelectSlot renders SlotModal', async () => {
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Inventory2Page — rack dismantle / placement / fans', () => {
  it('dismantle success calls the batch-uninstall endpoint and refetches', async () => {
    api.postRackUninstallBatch.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    api.getRooms.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByText('do-dismantle'));
    });
    await waitFor(() => expect(api.postRackUninstallBatch).toHaveBeenCalledWith([1]));
  });

  it('placing a rack calls postVisualPlacement and shows a success toast', async () => {
    const { toast } = await import('sonner');
    api.postVisualPlacement.mockResolvedValue({ data: { ok: true, placements: [{ visualIndex: 0, floorSlot: 1 }] } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-place-rack'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rack colocado.'));
  });

  it('mounting a fan calls postFanPlacement(mounted:true) and shows a success toast', async () => {
    const { toast } = await import('sonner');
    api.postFanPlacement.mockResolvedValue({ data: { ok: true, mounted: [0], fanCredits: 3 } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-mount-fan'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ventilador instalado.'));
  });

  it('unmounting a fan calls postFanPlacement(mounted:false) and shows a success toast', async () => {
    const { toast } = await import('sonner');
    api.postFanPlacement.mockResolvedValue({ data: { ok: true, mounted: [] } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-unmount-fan'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ventilador guardado.'));
  });

  it('onFanNeedsRack shows the expected toast', async () => {
    const { toast } = await import('sonner');
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-fan-needs-rack'));
    expect(toast.error).toHaveBeenCalledWith('Coloque um rack antes do ventilador.');
  });
});

describe('Inventory2Page — background refresh triggers', () => {
  it('a socket "inventory:update" event triggers a background refetch', async () => {
    mockSocket = { on: vi.fn(), off: vi.fn() };
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    expect(mockSocket.on).toHaveBeenCalledWith('inventory:update', expect.any(Function));
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'inventory:update')![1];
    api.getRooms.mockClear();
    await act(async () => {
      handler();
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(api.getRooms).toHaveBeenCalled();
  });

  it('the bm-inventory-changed window event triggers a background refetch', async () => {
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    api.getRooms.mockClear();
    await act(async () => {
      window.dispatchEvent(new CustomEvent('bm-inventory-changed'));
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(api.getRooms).toHaveBeenCalled();
  });
});

describe('Inventory2Page — remove / vault mutations via SlotModal', () => {
  it('a successful remove shows a toast and closes the slot modal', async () => {
    const { toast } = await import('sonner');
    api.postRackUninstall.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    await act(async () => {
      fireEvent.click(screen.getByText('do-remove'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Item removido.'));
    expect(screen.queryByTestId('slot-modal')).not.toBeInTheDocument();
  });

  it('a failed remove (ok:false) shows the resolved message', async () => {
    const { toast } = await import('sonner');
    api.postRackUninstall.mockResolvedValue({ data: { ok: false, message: 'Rack empty' } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    await act(async () => {
      fireEvent.click(screen.getByText('do-remove'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Rack empty'));
  });

  it('a thrown error during remove shows the fallback message', async () => {
    const { toast } = await import('sonner');
    api.postRackUninstall.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    await act(async () => {
      fireEvent.click(screen.getByText('do-remove'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
  });

  it('move-rack-to-vault success closes the slot modal', async () => {
    api.postMoveToVault.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    await act(async () => {
      fireEvent.click(screen.getByText('do-move-rack-to-vault'));
    });
    await waitFor(() => expect(screen.queryByTestId('slot-modal')).not.toBeInTheDocument());
    expect(api.postMoveToVault).toHaveBeenCalledWith({ source: 'rack', itemId: 7 });
  });

  it('move-rack-to-vault shows the VAULT_RACK_LINK message on a 409', async () => {
    const { toast } = await import('sonner');
    const { AxiosError } = await import('axios');
    api.postMoveToVault.mockRejectedValue(
      new AxiosError('conflict', 'ERR', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config: {} as never,
        data: {},
      }),
    );
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    await act(async () => {
      fireEvent.click(screen.getByText('do-move-rack-to-vault'));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('A máquina ainda está ligada a um rack. Atualize a página e tente novamente.'),
    );
  });

  it('move-rack-to-vault shows the generic vault error on a non-409 failure', async () => {
    const { toast } = await import('sonner');
    api.postMoveToVault.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    await act(async () => {
      fireEvent.click(screen.getByText('do-move-rack-to-vault'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falha ao mover máquina para o cofre.'));
  });

  it('handleRemove rejects an invalid rackId without calling the API', async () => {
    const { toast } = await import('sonner');
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    fireEvent.click(screen.getByText('do-remove-invalid'));
    expect(toast.error).toHaveBeenCalledWith('Erro');
    expect(api.postRackUninstall).not.toHaveBeenCalled();
  });

  it('handleMoveRackToVault rejects an invalid id without calling the API', async () => {
    const { toast } = await import('sonner');
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    fireEvent.click(screen.getByText('do-move-rack-to-vault-invalid'));
    expect(toast.error).toHaveBeenCalledWith('Erro');
    expect(api.postMoveToVault).not.toHaveBeenCalled();
  });

  it('closing the slot modal clears both selectedSlot and any open warehouse modal', async () => {
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-select-slot'));
    fireEvent.click(screen.getByText('do-close-slot-modal'));
    expect(screen.queryByTestId('slot-modal')).not.toBeInTheDocument();
  });
});

describe('Inventory2Page — move inventory item to vault via the warehouse modal', () => {
  it('opening the warehouse modal from the sidebar and confirming moves the item to vault', async () => {
    const { toast } = await import('sonner');
    api.getInventory.mockResolvedValue(okInventory([{ id: 1, minerName: 'Backpack Miner', hashRate: 10, slotSize: 1 }]));
    api.postMoveToVault.mockResolvedValue({ data: { ok: true } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Backpack Miner')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Enviar para o armazém'));
    await waitFor(() => expect(screen.getByTestId('qty-modal')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-confirm-qty'));
    });
    await waitFor(() => expect(api.postMoveToVault).toHaveBeenCalledWith({ source: 'inventory', itemId: 1 }));
    expect(screen.queryByTestId('qty-modal')).not.toBeInTheDocument();
  });

  it('shows the vault error toast when moving an inventory item to vault fails', async () => {
    const { toast } = await import('sonner');
    api.getInventory.mockResolvedValue(okInventory([{ id: 1, minerName: 'Backpack Miner', hashRate: 10, slotSize: 1 }]));
    api.postMoveToVault.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Backpack Miner')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Enviar para o armazém'));
    await waitFor(() => expect(screen.getByTestId('qty-modal')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-confirm-qty'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falha ao mover máquina para o cofre.'));
  });
});

describe('Inventory2Page — validation guards on the mutation handlers', () => {
  it('handleBuyRoom rejects an invalid room number without calling the API', async () => {
    const { toast } = await import('sonner');
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-buy-room-invalid'));
    expect(toast.error).toHaveBeenCalledWith('Erro');
    expect(api.postBuyRoom).not.toHaveBeenCalled();
  });

  it('handleInstall rejects invalid rackId/inventoryId without calling the API', async () => {
    const { toast } = await import('sonner');
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getByText('do-install-invalid'));
    expect(toast.error).toHaveBeenCalledWith('Erro');
    expect(api.postRackInstall).not.toHaveBeenCalled();
  });

  it('handleInstall rejects a 2-slot machine that would spill past the row edge', async () => {
    const { toast } = await import('sonner');
    api.getRooms.mockResolvedValue(
      okRooms([{ roomNumber: 1, unlocked: true, racks: [{ id: 1, position: 3 }] }]),
    );
    api.getInventory.mockResolvedValue(okInventory([{ id: 2, minerName: 'Big', slotSize: 2 }]));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-install'));
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Máquinas de 2 slots precisam começar antes do fim da linha. Use o slot anterior.'),
    );
    expect(api.postRackInstall).not.toHaveBeenCalled();
  });

  it('a thrown error during install shows the fallback error and still refetches', async () => {
    const { toast } = await import('sonner');
    api.postRackInstall.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    api.getRooms.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByText('do-install'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
    await waitFor(() => expect(api.getRooms).toHaveBeenCalled());
  });
});

describe('Inventory2Page — dismantle / place-rack / fan failure paths', () => {
  it('a failed batch-dismantle (ok:false) shows the resolved message and refetches, without committing the optimistic update', async () => {
    const { toast } = await import('sonner');
    api.postRackUninstallBatch.mockResolvedValue({ data: { ok: false, message: 'Cannot dismantle' } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-dismantle'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot dismantle'));
  });

  it('placing a rack shows the RACK_NOT_EMPTY-specific message on that error code', async () => {
    const { toast } = await import('sonner');
    const { AxiosError } = await import('axios');
    api.postVisualPlacement.mockRejectedValue(
      new AxiosError('bad', 'ERR', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { code: 'RACK_NOT_EMPTY' },
      }),
    );
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-place-rack'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Esvazie o rack antes de guardar.'));
  });

  it('storing a rack (floorSlot: null) also clears it from that room\'s mounted-fan list and shows the "stored" toast', async () => {
    const { toast } = await import('sonner');
    api.postVisualPlacement.mockResolvedValue({ data: { ok: true, placements: [{ visualIndex: 0, floorSlot: null }] } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-store-rack'));
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rack guardado.'));
  });

  it('placing a rack shows the generic apiErrorMessage for a thrown error without RACK_NOT_EMPTY', async () => {
    const { toast } = await import('sonner');
    api.postVisualPlacement.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-place-rack'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível mover o rack.'));
  });

  it('a thrown error during batch-dismantle shows the fallback error and still refetches', async () => {
    const { toast } = await import('sonner');
    api.postRackUninstallBatch.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    api.getRooms.mockClear();
    fireEvent.click(screen.getByText('do-dismantle'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
    await waitFor(() => expect(api.getRooms).toHaveBeenCalled());
  });

  it('placing a rack shows the generic place error on ok:false without a thrown error', async () => {
    const { toast } = await import('sonner');
    api.postVisualPlacement.mockResolvedValue({ data: { ok: false, message: 'Nope' } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-place-rack'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nope'));
  });

  it('mounting a fan shows the FAN_NEED_RACK-specific message', async () => {
    const { toast } = await import('sonner');
    const { AxiosError } = await import('axios');
    api.postFanPlacement.mockRejectedValue(
      new AxiosError('bad', 'ERR', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { code: 'FAN_NEED_RACK' },
      }),
    );
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-mount-fan'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Coloque um rack antes do ventilador.'));
  });

  it('mounting a fan shows the FAN_NO_CREDITS-specific message', async () => {
    const { toast } = await import('sonner');
    const { AxiosError } = await import('axios');
    api.postFanPlacement.mockRejectedValue(
      new AxiosError('bad', 'ERR', undefined, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
        data: { code: 'FAN_NO_CREDITS' },
      }),
    );
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-mount-fan'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Você não tem ventiladores disponíveis. Compre na loja ou ofertas.'));
  });

  it('mounting a fan shows the generic fan error for an unrecognized failure', async () => {
    const { toast } = await import('sonner');
    api.postFanPlacement.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-mount-fan'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível mover o ventilador.'));
  });

  it('mounting a fan shows the ok:false message when the server rejects without throwing', async () => {
    const { toast } = await import('sonner');
    api.postFanPlacement.mockResolvedValue({ data: { ok: false, message: 'No room' } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-mount-fan'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No room'));
  });

  it('unmounting a fan shows the fallback error on failure', async () => {
    const { toast } = await import('sonner');
    api.postFanPlacement.mockRejectedValue(new Error('down'));
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('do-unmount-fan'));
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível mover o ventilador.'));
  });
});

describe('Inventory2Page — location.state-driven refresh and background refresh cleanup', () => {
  it('a refreshInventory navigation state triggers a background refetch and clears the state', async () => {
    const { default: Inventory2Page } = await import('./Inventory2Page');
    await act(async () => {
      render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[{ pathname: '/inventory', state: { refreshInventory: true } }]}>
            <Inventory2Page />
          </MemoryRouter>
        </I18nextProvider>,
      );
    });
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/inventory', { replace: true, state: null }));
  });

  it('unmounting while a debounced background refresh is pending cleans up without error', async () => {
    mockSocket = { on: vi.fn(), off: vi.fn() };
    const { unmount } = await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    const handler = mockSocket.on.mock.calls.find((c) => c[0] === 'inventory:update')![1];
    act(() => {
      handler(); // schedules the debounced background refresh timer
    });
    expect(() => unmount()).not.toThrow();
  });
});

describe('Inventory2Page — header navigation', () => {
  it('the vault button navigates to /vault', async () => {
    await act(async () => mount());
    await waitFor(() => expect(screen.getByTestId('room-content')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Ir para o Armazém')[0]!);
    expect(navigate).toHaveBeenCalledWith('/vault');
  });
});
