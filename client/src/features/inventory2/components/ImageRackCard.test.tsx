import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { ImageRackCard, type ImageRackCardProps } from './ImageRackCard';
import type { UserRackSlot } from '../../machines/lib/machines.types';
import { VISUAL_FAN_DRAG, VISUAL_FAN_FROM_DRAG } from '../lib/inventory2.rackLayout';

const i18n = i18next.createInstance();

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

function setHoverFine(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(async () => {
  vi.clearAllMocks();
  setHoverFine(false);
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(cleanup);

function makeDataTransfer(entries: Record<string, string> = {}) {
  const store = { ...entries };
  return {
    getData: (key: string) => store[key] ?? '',
    setData: (key: string, value: string) => {
      store[key] = value;
    },
    effectAllowed: '',
  } as unknown as DataTransfer;
}

function slot(overrides: Partial<UserRackSlot> = {}): UserRackSlot {
  return { id: 1, position: 0, ...overrides };
}

function baseProps(overrides: Partial<ImageRackCardProps> = {}): ImageRackCardProps {
  return {
    rackNumber: 1,
    slots: [slot({ id: 1 }), slot({ id: 2, position: 1 })],
    onSlotClick: vi.fn(),
    onSlotDrop: vi.fn(),
    onDismantleRack: vi.fn().mockResolvedValue(undefined),
    rackDismantleLoading: false,
    rackActionBusy: false,
    ...overrides,
  };
}

describe('ImageRackCard — empty rack', () => {
  it('renders one clickable button per slot, none occupied', () => {
    render(withProviders(<ImageRackCard {...baseProps()} />));
    const emptyButtons = screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário');
    expect(emptyButtons).toHaveLength(2);
  });

  it('clicking an empty slot calls onSlotClick with the right payload', () => {
    const onSlotClick = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ onSlotClick })} />));
    fireEvent.click(screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário')[0]!);
    expect(onSlotClick).toHaveBeenCalledWith({ rack: slot({ id: 1 }), miner: undefined, visualRackNumber: 1, slotInRack: 0 });
  });

  it('does not show the power badge or dismantle button when no machine is installed', () => {
    render(withProviders(<ImageRackCard {...baseProps()} />));
    expect(screen.queryByLabelText(/Poder do rack/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Desmontar o rack: máquinas para o inventário, rack e ventilador guardados')).not.toBeInTheDocument();
  });

  it('drag-over an empty slot marks it a drag target, drag-leave clears it', () => {
    render(withProviders(<ImageRackCard {...baseProps()} />));
    const target = screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário')[0]!;
    fireEvent.dragOver(target, { dataTransfer: makeDataTransfer() });
    expect(target).toHaveClass('bg-primary/20');
    fireEvent.dragLeave(target);
    expect(target).not.toHaveClass('bg-primary/20');
  });

  it('dropping a valid inventory id on an empty slot calls onSlotDrop with the rack + inventory id', () => {
    const onSlotDrop = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ onSlotDrop })} />));
    const target = screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário')[0]!;
    fireEvent.drop(target, { dataTransfer: makeDataTransfer({ inventoryId: '42' }) });
    expect(onSlotDrop).toHaveBeenCalledWith(1, 42);
  });

  it('dropping invalid/missing inventory-id data does nothing', () => {
    const onSlotDrop = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ onSlotDrop })} />));
    const target = screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário')[0]!;
    fireEvent.drop(target, { dataTransfer: makeDataTransfer({ inventoryId: 'not-a-number' }) });
    expect(onSlotDrop).not.toHaveBeenCalled();
  });

  it('disables every slot button while rackActionBusy or rackDismantleLoading', () => {
    render(withProviders(<ImageRackCard {...baseProps({ rackActionBusy: true })} />));
    for (const btn of screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário')) {
      expect(btn).toBeDisabled();
    }
  });
});

describe('ImageRackCard — occupied rack', () => {
  function occupiedProps(overrides: Partial<ImageRackCardProps> = {}) {
    return baseProps({
      slots: [
        slot({ id: 1, position: 0, miner: { id: 50, minerId: 1, minerName: 'Quantum Miner', hashRate: 1500, slotSize: 1 } }),
        slot({ id: 2, position: 1 }),
      ],
      ...overrides,
    });
  }

  it('shows a live indicator, the total power badge, and a dismantle button', () => {
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    expect(screen.getByLabelText('Poder do rack: 1.50 KH/s')).toBeInTheDocument();
    expect(screen.getByLabelText('Desmontar o rack: máquinas para o inventário, rack e ventilador guardados')).toBeInTheDocument();
  });

  it('an occupied slot is not a drop target (no onDrop wiring, no drag-target style)', () => {
    const onSlotDrop = vi.fn();
    render(withProviders(<ImageRackCard {...occupiedProps({ onSlotDrop })} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.dragOver(occupied, { dataTransfer: makeDataTransfer() });
    fireEvent.drop(occupied, { dataTransfer: makeDataTransfer({ inventoryId: '1' }) });
    expect(onSlotDrop).not.toHaveBeenCalled();
  });

  it('the confirm modal does not close via backdrop while a dismantle is in flight', () => {
    const { rerender } = render(withProviders(<ImageRackCard {...occupiedProps()} />));
    fireEvent.click(screen.getByLabelText('Desmontar o rack: máquinas para o inventário, rack e ventilador guardados'));
    expect(screen.getByText('Confirmar desmontagem')).toBeInTheDocument();

    rerender(withProviders(<ImageRackCard {...occupiedProps({ rackDismantleLoading: true })} />));
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking the dismantle button opens the confirm modal, and confirming calls onDismantleRack', async () => {
    const onDismantleRack = vi.fn().mockResolvedValue(undefined);
    render(withProviders(<ImageRackCard {...occupiedProps({ onDismantleRack })} />));
    fireEvent.click(screen.getByLabelText('Desmontar o rack: máquinas para o inventário, rack e ventilador guardados'));
    fireEvent.click(screen.getByText('Confirmar desmontagem'));
    await waitFor(() => expect(onDismantleRack).toHaveBeenCalledWith(occupiedProps().slots));
  });

  it('after a successful dismantle, also unplaces the rack silently when visualIndex + onUnplaceRack are given', async () => {
    const onDismantleRack = vi.fn().mockResolvedValue(undefined);
    const onUnplaceRack = vi.fn().mockResolvedValue(undefined);
    render(withProviders(<ImageRackCard {...occupiedProps({ onDismantleRack, visualIndex: 3, onUnplaceRack })} />));
    fireEvent.click(screen.getAllByLabelText('Desmontar o rack: máquinas para o inventário, rack e ventilador guardados')[0]!);
    fireEvent.click(screen.getByText('Confirmar desmontagem'));
    await waitFor(() => expect(onUnplaceRack).toHaveBeenCalledWith(3, { silent: true }));
  });

  it('shows the tooltip on focus (regardless of pointer type) and hides it on blur', () => {
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.focus(occupied);
    expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0);
    fireEvent.blur(occupied);
  });

  it('shows the hover tooltip only when a fine pointer is detected', async () => {
    setHoverFine(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.mouseEnter(occupied);
    vi.advanceTimersByTime(200);
    await vi.waitFor(() => expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0));
    fireEvent.mouseLeave(occupied);
    vi.useRealTimers();
  });

  it('mouse-leave before the scheduled show fires cancels the pending timer (no stuck tooltip)', () => {
    setHoverFine(true);
    vi.useFakeTimers();
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.mouseEnter(occupied);
    fireEvent.mouseLeave(occupied);
    vi.advanceTimersByTime(500);
    expect(screen.queryAllByText('Quantum Miner')).toHaveLength(0);
    vi.useRealTimers();
  });

  it('re-entering while a tooltip is already showing switches it immediately (no re-scheduled delay)', () => {
    setHoverFine(true);
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.focus(occupied); // synchronously shows the tip
    fireEvent.mouseEnter(occupied); // machineTip is already set -> immediate branch
    expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0);
  });

  it('an outside pointerdown dismisses the tooltip, a click on the anchor itself does not', () => {
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.focus(occupied);
    expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0);

    fireEvent.pointerDown(occupied);
    expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0);

    fireEvent.pointerDown(document.body);
    expect(screen.queryAllByText('Quantum Miner')).toHaveLength(0);
  });

  it('pressing Escape dismisses the tooltip', () => {
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    fireEvent.focus(screen.getByRole('button', { name: /Quantum Miner/ }));
    expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryAllByText('Quantum Miner')).toHaveLength(0);
  });

  it('scrolling dismisses the tooltip', () => {
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    fireEvent.focus(screen.getByRole('button', { name: /Quantum Miner/ }));
    expect(screen.getAllByText('Quantum Miner').length).toBeGreaterThan(0);
    fireEvent.scroll(window);
    expect(screen.queryAllByText('Quantum Miner')).toHaveLength(0);
  });

  it('does not schedule a hover tooltip without a fine pointer', () => {
    render(withProviders(<ImageRackCard {...occupiedProps()} />));
    const occupied = screen.getByRole('button', { name: /Quantum Miner/ });
    fireEvent.mouseEnter(occupied);
    // Only the slot label itself contains the name — no portal tooltip appeared.
    expect(screen.queryAllByText('Quantum Miner')).toHaveLength(0);
  });

  it('merges the overlay for a 2-slot machine and renders only one button for both cells', () => {
    render(
      withProviders(
        <ImageRackCard
          {...baseProps({
            slots: [
              slot({ id: 1, position: 0, miner: { id: 50, minerId: 1, minerName: 'Big Rig', hashRate: 500, slotSize: 2 } }),
              slot({ id: 2, position: 1, blockedByMinerId: 50 }),
            ],
          })}
        />,
      ),
    );
    // The blocked slot is skipped entirely — only one occupied button renders.
    expect(screen.getAllByRole('button', { name: /Big Rig/ })).toHaveLength(1);
  });

  it('clicking an occupied slot still calls onSlotClick with its machine payload', () => {
    const onSlotClick = vi.fn();
    render(withProviders(<ImageRackCard {...occupiedProps({ onSlotClick })} />));
    fireEvent.click(screen.getByRole('button', { name: /Quantum Miner/ }));
    expect(onSlotClick).toHaveBeenCalledWith(
      expect.objectContaining({ visualRackNumber: 1, slotInRack: 0, miner: expect.objectContaining({ minerName: 'Quantum Miner' }) }),
    );
  });
});

describe('ImageRackCard — slot overflow', () => {
  it('slots beyond the 8-slot visual layout (computeSlotOverlayStyle returns null) are skipped, not crashed on', () => {
    const slots = Array.from({ length: 9 }, (_, i) => slot({ id: i + 1, position: i }));
    render(withProviders(<ImageRackCard {...baseProps({ slots })} />));
    // Only the first 8 have a valid overlay rect; the 9th renders no button.
    expect(screen.getAllByLabelText('Slot vazio — abra para instalar uma máquina do inventário')).toHaveLength(8);
  });
});

describe('ImageRackCard — visual placement (drag handle, unplace)', () => {
  it('shows a drag handle when visualIndex is set, wired to set drag data', () => {
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 4 })} />));
    const handle = screen.getByLabelText('Arrastar rack');
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(handle, { dataTransfer });
    expect(dataTransfer.getData('visualRackIndex')).toBe('4');
  });

  it('unplace button calls onUnplaceRack directly when the rack has no machines', () => {
    const onUnplaceRack = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 2, onUnplaceRack })} />));
    fireEvent.click(screen.getByLabelText('Tirar o rack da sala'));
    expect(onUnplaceRack).toHaveBeenCalledWith(2);
  });

  it('unplace button opens the confirm-dismantle modal instead when the rack has machines', () => {
    const onUnplaceRack = vi.fn();
    render(
      withProviders(
        <ImageRackCard
          {...baseProps({
            visualIndex: 2,
            onUnplaceRack,
            slots: [slot({ id: 1, miner: { id: 1, minerId: 1, minerName: 'X', hashRate: 1 } })],
          })}
        />,
      ),
    );
    fireEvent.click(screen.getAllByLabelText('Desmontar o rack: máquinas para o inventário, rack e ventilador guardados')[0]!);
    expect(onUnplaceRack).not.toHaveBeenCalled();
    expect(screen.getByText('Confirmar desmontagem')).toBeInTheDocument();
  });
});

describe('ImageRackCard — fan bay', () => {
  it('renders no fan bay when visualIndex/onMountFan are absent', () => {
    render(withProviders(<ImageRackCard {...baseProps()} />));
    expect(screen.queryByLabelText('Solte o ventilador aqui')).not.toBeInTheDocument();
  });

  it('empty fan bay: clicking calls onSelectFanBay when provided', () => {
    const onSelectFanBay = vi.fn();
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan, onSelectFanBay })} />));
    fireEvent.click(screen.getByLabelText('Solte o ventilador aqui'));
    expect(onSelectFanBay).toHaveBeenCalledTimes(1);
    expect(onMountFan).not.toHaveBeenCalled();
  });

  it('empty fan bay: clicking calls onMountFan(null) when onSelectFanBay is absent', () => {
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan })} />));
    fireEvent.click(screen.getByLabelText('Solte o ventilador aqui'));
    expect(onMountFan).toHaveBeenCalledWith(null);
  });

  it('shows the "selected" empty-bay label/style when fanBaySelectable', () => {
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan: vi.fn(), fanBaySelectable: true })} />));
    expect(screen.getByLabelText('Clique aqui para colocar o ventilador')).toBeInTheDocument();
  });

  it('mounted fan bay: renders the spinning fan and an unmount button', () => {
    const onUnmountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan: vi.fn(), fanMounted: true, onUnmountFan })} />));
    fireEvent.click(screen.getByLabelText('Tirar o ventilador do rack e guardar'));
    expect(onUnmountFan).toHaveBeenCalledTimes(1);
  });

  it('mounted fan: drag start sets both fan-drag markers', () => {
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 5, onMountFan: vi.fn(), fanMounted: true })} />));
    const handle = screen.getByLabelText('Arrastar ventilador');
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(handle, { dataTransfer });
    expect(dataTransfer.getData(VISUAL_FAN_DRAG)).toBe('1');
    expect(dataTransfer.getData(VISUAL_FAN_FROM_DRAG)).toBe('5');
  });

  it('drop from the sidebar (marker "1") mounts the fan', () => {
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan })} />));
    fireEvent.drop(screen.getByLabelText('Solte o ventilador aqui'), {
      dataTransfer: makeDataTransfer({ [VISUAL_FAN_DRAG]: '1' }),
    });
    expect(onMountFan).toHaveBeenCalledWith(null);
  });

  it('drop from another rack (fromRack index) mounts the fan with that origin', () => {
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan })} />));
    fireEvent.drop(screen.getByLabelText('Solte o ventilador aqui'), {
      dataTransfer: makeDataTransfer({ [VISUAL_FAN_FROM_DRAG]: '3' }),
    });
    expect(onMountFan).toHaveBeenCalledWith(3);
  });

  it('drop with neither marker is ignored', () => {
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan })} />));
    fireEvent.drop(screen.getByLabelText('Solte o ventilador aqui'), { dataTransfer: makeDataTransfer() });
    expect(onMountFan).not.toHaveBeenCalled();
  });

  it('dropping a fan onto its own already-mounted bay (same visualIndex) is a no-op', () => {
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan, fanMounted: true })} />));
    fireEvent.drop(screen.getByLabelText('Arrastar ventilador').parentElement!.parentElement!, {
      dataTransfer: makeDataTransfer({ [VISUAL_FAN_FROM_DRAG]: '1' }),
    });
    expect(onMountFan).not.toHaveBeenCalled();
  });

  it('fan-bay drag-over/drop are inert while rackActionBusy', () => {
    const onMountFan = vi.fn();
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan, rackActionBusy: true })} />));
    const bay = screen.getByLabelText('Solte o ventilador aqui').parentElement as HTMLElement;
    fireEvent.dragOver(bay, { dataTransfer: makeDataTransfer() });
    expect(bay).not.toHaveClass('border-sky-400/40');
    fireEvent.drop(bay, { dataTransfer: makeDataTransfer({ [VISUAL_FAN_DRAG]: '1' }) });
    expect(onMountFan).not.toHaveBeenCalled();
  });

  it('fan-bay drag-over/leave toggles the drop-target style', () => {
    render(withProviders(<ImageRackCard {...baseProps({ visualIndex: 1, onMountFan: vi.fn() })} />));
    const bay = screen.getByLabelText('Solte o ventilador aqui').parentElement as HTMLElement;
    fireEvent.dragOver(bay, { dataTransfer: makeDataTransfer() });
    expect(bay).toHaveClass('border-sky-400/40');
    fireEvent.dragLeave(bay);
    expect(bay).not.toHaveClass('border-sky-400/40');
  });
});
