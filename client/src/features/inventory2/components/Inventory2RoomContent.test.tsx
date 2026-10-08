import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { Inventory2RoomContent, type Inventory2RoomContentProps } from './Inventory2RoomContent';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// Isolate Inventory2RoomContent's own wiring/state from ImageRackCard's internals
// (already covered in full by ImageRackCard.test.tsx) with a minimal, inspectable stub.
vi.mock('./ImageRackCard', () => ({
  ImageRackCard: (props: Record<string, unknown>) => (
    <div data-testid={`rack-${props.rackNumber}`}>
      <button type="button" onClick={() => (props.onSlotClick as (s: unknown) => void)({ dummy: true })}>
        slot-click
      </button>
      <button type="button" onClick={() => (props.onDismantleRack as (s: unknown[]) => void)(props.slots as unknown[])}>
        dismantle-rack
      </button>
      <button
        type="button"
        onClick={() => (props.onUnplaceRack as (i: number) => void)(props.visualIndex as number)}
      >
        unplace-rack
      </button>
      <button
        type="button"
        onClick={() => (props.onMountFan as (from?: number | null) => void)(null)}
      >
        mount-fan
      </button>
      <button type="button" onClick={() => (props.onUnmountFan as () => void)()}>
        unmount-fan
      </button>
      <button type="button" onClick={() => (props.onSelectFanBay as (() => void) | undefined)?.()}>
        select-fan-bay
      </button>
      <span data-testid={`fan-mounted-${props.rackNumber}`}>{String(props.fanMounted)}</span>
      <span data-testid={`fan-selectable-${props.rackNumber}`}>{String(props.fanBaySelectable)}</span>
    </div>
  ),
}));

const i18n = i18next.createInstance();

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(cleanup);

function baseProps(overrides: Partial<Inventory2RoomContentProps> = {}): Inventory2RoomContentProps {
  return {
    currentRoom: { roomNumber: 1, unlocked: true, racks: [] },
    visualRacksOfCurrent: [],
    rackOffset: 0,
    onSelectSlot: vi.fn(),
    onInstall: vi.fn(),
    onDismantleRack: vi.fn().mockResolvedValue(undefined),
    rackDismantleLoading: false,
    rackActionBusy: false,
    buyingRoom: false,
    onBuyRoom: vi.fn(),
    placements: [],
    onPlaceRack: vi.fn(),
    mountedFans: [],
    onMountFan: vi.fn(),
    onUnmountFan: vi.fn(),
    onFanNeedsRack: vi.fn(),
    ...overrides,
  };
}

function makeDataTransfer(entries: Record<string, string> = {}) {
  return { getData: (key: string) => entries[key] ?? '' } as unknown as DataTransfer;
}

describe('Inventory2RoomContent — loading / locked / unlocked shell', () => {
  it('shows a spinner when there is no current room yet', () => {
    render(withProviders(<Inventory2RoomContent {...baseProps({ currentRoom: null })} />));
    expect(screen.getByRole('tabpanel').querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows the locked state with a buy button and no price-strike when not on offer', () => {
    const onBuyRoom = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ currentRoom: { roomNumber: 2, unlocked: false, price: 10, racks: [] }, onBuyRoom })}
        />,
      ),
    );
    expect(screen.getByText('Sala 2 bloqueada')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Comprar por 10 BLK'));
    expect(onBuyRoom).toHaveBeenCalledWith(2);
  });

  it('shows "unlock free" for a 0-price room', () => {
    render(
      withProviders(
        <Inventory2RoomContent {...baseProps({ currentRoom: { roomNumber: 1, unlocked: false, price: 0, racks: [] } })} />,
      ),
    );
    expect(screen.getByText('Desbloquear grátis')).toBeInTheDocument();
  });

  it('shows a spinner in the buy button while buyingRoom', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ currentRoom: { roomNumber: 1, unlocked: false, price: 5, racks: [] }, buyingRoom: true })}
        />,
      ),
    );
    expect(screen.queryByText('Comprar por 5 BLK')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '' })).toBeDisabled();
  });

  it('shows a strikethrough list price when the room is on offer and discounted', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            currentRoom: { roomNumber: 3, unlocked: false, price: 25, listPrice: 50, onOffer: true, racks: [] },
          })}
        />,
      ),
    );
    expect(screen.getByText('50 BLK')).toBeInTheDocument();
  });

  it('does not show a strike-through price when not on offer even if listPrice differs', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            currentRoom: { roomNumber: 3, unlocked: false, price: 25, listPrice: 50, onOffer: false, racks: [] },
          })}
        />,
      ),
    );
    expect(screen.queryByText('50 BLK')).not.toBeInTheDocument();
  });
});

describe('Inventory2RoomContent — unlocked room, empty floor pads', () => {
  it('renders one empty pad per visual rack slot and shows the empty aria label', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }, { rackNumber: 2, slots: [] }] })}
        />,
      ),
    );
    expect(screen.getAllByLabelText('Clique para escolher um rack')).toHaveLength(2);
  });

  it('clicking an empty pad with no pending placement and no stored racks shows a toast', async () => {
    const { toast } = await import('sonner');
    render(
      withProviders(<Inventory2RoomContent {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }] })} />),
    );
    fireEvent.click(screen.getByLabelText('Clique para escolher um rack'));
    expect(toast.error).toHaveBeenCalledWith('Nenhum rack guardado. Guarde um rack da sala primeiro.');
  });

  it('clicking an empty pad with a pending rack placement calls onPlaceRack and consumes it', async () => {
    const onPlaceRack = vi.fn();
    const onConsumePendingPlacement = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }],
            pendingPlacement: { type: 'rack', visualIndex: 4 },
            onPlaceRack,
            onConsumePendingPlacement,
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Clique aqui para colocar o rack'));
    await waitFor(() => expect(onPlaceRack).toHaveBeenCalledWith(4, 0));
    expect(onConsumePendingPlacement).toHaveBeenCalledTimes(1);
  });

  it('clicking an empty pad with a pending fan placement calls onFanNeedsRack instead', () => {
    const onFanNeedsRack = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }],
            pendingPlacement: { type: 'fan' },
            onFanNeedsRack,
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Clique para escolher um rack'));
    expect(onFanNeedsRack).toHaveBeenCalledTimes(1);
  });

  it('Enter/Space on an empty pad triggers the same click handler', async () => {
    const { toast } = await import('sonner');
    render(
      withProviders(<Inventory2RoomContent {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }] })} />),
    );
    fireEvent.keyDown(screen.getByLabelText('Clique para escolher um rack'), { key: 'Enter' });
    expect(toast.error).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Clique para escolher um rack'), { key: ' ' });
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it('an unrelated key on an empty pad does nothing', async () => {
    const { toast } = await import('sonner');
    render(
      withProviders(<Inventory2RoomContent {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }] })} />),
    );
    fireEvent.keyDown(screen.getByLabelText('Clique para escolher um rack'), { key: 'Tab' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('clicking an empty pad with stored racks opens the rack picker', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }],
            storedRacks: [{ visualIndex: 2, rackNumber: 3 }],
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Clique para escolher um rack'));
    expect(screen.getByText('Escolher rack')).toBeInTheDocument();
  });

  it('the picker lists stored racks and picking one places it + closes the picker + consumes pending placement', async () => {
    const onPlaceRack = vi.fn();
    const onConsumePendingPlacement = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }],
            storedRacks: [{ visualIndex: 2, rackNumber: 3 }],
            onPlaceRack,
            onConsumePendingPlacement,
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Clique para escolher um rack'));
    fireEvent.click(screen.getByText('Rack'));
    await waitFor(() => expect(onPlaceRack).toHaveBeenCalledWith(2, 0));
    expect(onConsumePendingPlacement).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Escolher rack')).not.toBeInTheDocument();
  });

  it('the picker shows an empty message when there are no stored racks yet somehow opened', () => {
    // Force-open by clicking with stored racks present, then simulate a re-render with none left.
    const { rerender } = render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }], storedRacks: [{ visualIndex: 2, rackNumber: 3 }] })}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Clique para escolher um rack'));
    rerender(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }], storedRacks: [] })}
        />,
      ),
    );
    expect(screen.getByText('Nenhum rack guardado. Guarde um rack da sala primeiro.')).toBeInTheDocument();
  });

  it('the picker closes via its own close button', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }], storedRacks: [{ visualIndex: 2, rackNumber: 3 }] })}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Clique para escolher um rack'));
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(screen.queryByText('Escolher rack')).not.toBeInTheDocument();
  });

  it('dragging a rack over/leaving/dropping on an empty pad places it', () => {
    const onPlaceRack = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }], onPlaceRack })} />,
      ),
    );
    const pad = screen.getByLabelText('Clique para escolher um rack');
    fireEvent.dragOver(pad, { dataTransfer: makeDataTransfer() });
    expect(pad).toHaveClass('border-primary');
    fireEvent.dragLeave(pad);
    expect(pad).not.toHaveClass('border-primary');
    fireEvent.drop(pad, { dataTransfer: makeDataTransfer({ visualRackIndex: '7' }) });
    expect(onPlaceRack).toHaveBeenCalledWith(7, 0);
  });

  it('dropping a fan marker (no rack index) on an empty pad calls onFanNeedsRack', () => {
    const onFanNeedsRack = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }], onFanNeedsRack })}
        />,
      ),
    );
    fireEvent.drop(screen.getByLabelText('Clique para escolher um rack'), {
      dataTransfer: makeDataTransfer({ visualFan: '1' }),
    });
    expect(onFanNeedsRack).toHaveBeenCalledTimes(1);
  });

  it('dropping garbage data on an empty pad does nothing', () => {
    const onPlaceRack = vi.fn();
    const onFanNeedsRack = vi.fn();
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({ visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }], onPlaceRack, onFanNeedsRack })}
        />,
      ),
    );
    fireEvent.drop(screen.getByLabelText('Clique para escolher um rack'), { dataTransfer: makeDataTransfer() });
    expect(onPlaceRack).not.toHaveBeenCalled();
    expect(onFanNeedsRack).not.toHaveBeenCalled();
  });

  it('a fan-pending placement highlights every empty pad', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...baseProps({
            visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }],
            pendingPlacement: { type: 'fan' },
          })}
        />,
      ),
    );
    expect(screen.getByLabelText('Clique para escolher um rack')).toHaveClass('border-slate-800');
  });
});

describe('Inventory2RoomContent — a placed rack', () => {
  function placedProps(overrides: Partial<Inventory2RoomContentProps> = {}) {
    return baseProps({
      visualRacksOfCurrent: [{ rackNumber: 1, slots: [] }],
      placements: [{ visualIndex: 0, floorSlot: 0 }],
      rackOffset: 10,
      ...overrides,
    });
  }

  it('renders the stubbed ImageRackCard with the offset rack number', () => {
    render(withProviders(<Inventory2RoomContent {...placedProps()} />));
    expect(screen.getByTestId('rack-11')).toBeInTheDocument();
  });

  it('forwards onSlotClick through to onSelectSlot', () => {
    const onSelectSlot = vi.fn();
    render(withProviders(<Inventory2RoomContent {...placedProps({ onSelectSlot })} />));
    fireEvent.click(screen.getByText('slot-click'));
    expect(onSelectSlot).toHaveBeenCalledWith({ dummy: true });
  });

  it('forwards onDismantleRack through to the parent handler', () => {
    const onDismantleRack = vi.fn().mockResolvedValue(undefined);
    render(withProviders(<Inventory2RoomContent {...placedProps({ onDismantleRack })} />));
    fireEvent.click(screen.getByText('dismantle-rack'));
    expect(onDismantleRack).toHaveBeenCalledWith([]);
  });

  it('unplace calls onPlaceRack(visualIndex, null)', () => {
    const onPlaceRack = vi.fn();
    render(withProviders(<Inventory2RoomContent {...placedProps({ onPlaceRack })} />));
    fireEvent.click(screen.getByText('unplace-rack'));
    expect(onPlaceRack).toHaveBeenCalledWith(0, null, undefined);
  });

  it('mount/unmount fan forward with the right visualIndex', () => {
    const onMountFan = vi.fn();
    const onUnmountFan = vi.fn();
    render(withProviders(<Inventory2RoomContent {...placedProps({ onMountFan, onUnmountFan })} />));
    fireEvent.click(screen.getByText('mount-fan'));
    expect(onMountFan).toHaveBeenCalledWith(0, null);
    fireEvent.click(screen.getByText('unmount-fan'));
    expect(onUnmountFan).toHaveBeenCalledWith(0);
  });

  it('selecting the fan bay mounts the fan at this rack and consumes the pending placement', () => {
    const onMountFan = vi.fn();
    const onConsumePendingPlacement = vi.fn();
    render(withProviders(<Inventory2RoomContent {...placedProps({ onMountFan, onConsumePendingPlacement })} />));
    fireEvent.click(screen.getByText('select-fan-bay'));
    expect(onMountFan).toHaveBeenCalledWith(0, null);
    expect(onConsumePendingPlacement).toHaveBeenCalledTimes(1);
  });

  it('reflects fanMounted/fanBaySelectable from mountedFans/pendingPlacement', () => {
    render(
      withProviders(
        <Inventory2RoomContent
          {...placedProps({ mountedFans: [0], pendingPlacement: { type: 'fan' } })}
        />,
      ),
    );
    expect(screen.getByTestId('fan-mounted-11')).toHaveTextContent('true');
    expect(screen.getByTestId('fan-selectable-11')).toHaveTextContent('true');
  });

  it('dragging over/dropping onto an occupied pad also places a dropped rack (pad wrapper drop)', () => {
    const onPlaceRack = vi.fn();
    render(withProviders(<Inventory2RoomContent {...placedProps({ onPlaceRack })} />));
    const wrapper = screen.getByTestId('rack-11').parentElement as HTMLElement;
    fireEvent.dragOver(wrapper, { dataTransfer: makeDataTransfer() });
    fireEvent.dragLeave(wrapper);
    fireEvent.drop(wrapper, { dataTransfer: makeDataTransfer({ visualRackIndex: '9' }) });
    expect(onPlaceRack).toHaveBeenCalledWith(9, 0);
  });
});

describe('Inventory2RoomContent — room dismantle modal', () => {
  function occupiedRoomProps(overrides: Partial<Inventory2RoomContentProps> = {}) {
    return baseProps({
      currentRoom: {
        roomNumber: 4,
        unlocked: true,
        racks: [{ id: 1, position: 0, miner: { id: 1, minerId: 1, minerName: 'X', hashRate: 1 } }],
      },
      ...overrides,
    });
  }

  it('shows the dismantle-room button only when there are occupied slots', () => {
    const { rerender } = render(withProviders(<Inventory2RoomContent {...baseProps()} />));
    expect(screen.queryByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário')).not.toBeInTheDocument();
    rerender(withProviders(<Inventory2RoomContent {...occupiedRoomProps()} />));
    expect(screen.getByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário')).toBeInTheDocument();
  });

  it('opens the confirm modal, cancel closes it without confirming', () => {
    const onDismantleRack = vi.fn();
    render(withProviders(<Inventory2RoomContent {...occupiedRoomProps({ onDismantleRack })} />));
    fireEvent.click(screen.getByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário'));
    expect(screen.getByText('Deseja desmontar a sala 4? 1 máquina(s) serão enviadas ao inventário.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByText('Deseja desmontar a sala 4? 1 máquina(s) serão enviadas ao inventário.')).not.toBeInTheDocument();
    expect(onDismantleRack).not.toHaveBeenCalled();
  });

  it('confirming calls onDismantleRack with the room racks + success message, then closes', async () => {
    const onDismantleRack = vi.fn().mockResolvedValue(undefined);
    render(withProviders(<Inventory2RoomContent {...occupiedRoomProps({ onDismantleRack })} />));
    fireEvent.click(screen.getByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário'));
    fireEvent.click(screen.getByText('Confirmar desmontagem'));
    await waitFor(() =>
      expect(onDismantleRack).toHaveBeenCalledWith(occupiedRoomProps().currentRoom!.racks, 'Sala desmontada com sucesso!'),
    );
  });

  it('cancel/backdrop close is disabled while rackDismantleLoading', () => {
    const { rerender } = render(withProviders(<Inventory2RoomContent {...occupiedRoomProps()} />));
    fireEvent.click(screen.getByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário'));
    rerender(withProviders(<Inventory2RoomContent {...occupiedRoomProps({ rackDismantleLoading: true })} />));
    expect(screen.getByText('Cancelar')).toBeDisabled();
  });

  it('shows the loading label on the confirm button while loading', () => {
    const { rerender } = render(withProviders(<Inventory2RoomContent {...occupiedRoomProps()} />));
    fireEvent.click(screen.getByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário'));
    rerender(withProviders(<Inventory2RoomContent {...occupiedRoomProps({ rackDismantleLoading: true })} />));
    expect(screen.getByText('Removendo máquinas da sala…')).toBeInTheDocument();
  });

  it('the dismantle-room trigger is disabled while rackActionBusy', () => {
    render(withProviders(<Inventory2RoomContent {...occupiedRoomProps({ rackActionBusy: true })} />));
    expect(screen.getByLabelText('Desmontar a sala inteira e enviar todas as máquinas para o inventário')).toBeDisabled();
  });
});
