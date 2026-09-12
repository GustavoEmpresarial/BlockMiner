import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { SlotModal } from './machines.slotModal';
import type { InventoryStackGroup, SelectedSlotPayload, UserRackSlot } from '../lib/machines.types';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const i18n = i18next.createInstance();

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(cleanup);

function rack(overrides: Partial<UserRackSlot> = {}): UserRackSlot {
  return { id: 10, position: 0, ...overrides };
}

function occupiedSlot(overrides: Partial<SelectedSlotPayload> = {}): SelectedSlotPayload {
  return {
    rack: rack({ id: 10 }),
    miner: { id: 99, minerId: 1, minerName: 'Quantum Miner', hashRate: 1500, level: 2, slotSize: 1, imageUrl: null },
    visualRackNumber: 2,
    slotInRack: 3,
    ...overrides,
  };
}

function emptySlot(overrides: Partial<SelectedSlotPayload> = {}): SelectedSlotPayload {
  return { rack: rack({ id: 10 }), miner: null, visualRackNumber: 2, slotInRack: 3, ...overrides };
}

function group(overrides: Partial<InventoryStackGroup> = {}): InventoryStackGroup {
  const item = { id: 1, minerId: 1, minerName: 'Basic Miner', hashRate: 10, slotSize: 1, ...overrides };
  return { ...item, quantity: 1, items: [item], ...overrides };
}

function baseProps(overrides: Partial<Parameters<typeof SlotModal>[0]> = {}) {
  return {
    slot: emptySlot(),
    groupedInventory: [] as InventoryStackGroup[],
    onInstall: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onMoveToVault: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    actionBusy: false,
    ...overrides,
  };
}

describe('SlotModal — occupied slot (details/remove view)', () => {
  it('shows machine details and the rack/slot header', () => {
    render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot() })} />));
    expect(screen.getByText('Detalhes da Máquina')).toBeInTheDocument();
    expect(screen.getByText('Rack 2 • Slot 4')).toBeInTheDocument();
    expect(screen.getByText('Quantum Miner')).toBeInTheDocument();
    expect(screen.getByText('1.50 KH/s')).toBeInTheDocument();
  });

  it('shows the slot count only for a 2+ slot machine', () => {
    const { rerender } = render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot() })} />));
    expect(screen.queryByText('Slots')).not.toBeInTheDocument();
    rerender(
      withProviders(
        <SlotModal {...baseProps({ slot: occupiedSlot({ miner: { ...occupiedSlot().miner!, slotSize: 2 } }) })} />,
      ),
    );
    expect(screen.getByText('Slots')).toBeInTheDocument();
  });

  it('remove-to-inventory requires a confirm click, then calls onRemove with the rack id', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot(), onRemove })} />));
    fireEvent.click(screen.getByText('Remover para o Inventário'));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirmar desmontagem'));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(10));
  });

  it('cancel button clears a pending confirmation', () => {
    render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot() })} />));
    fireEvent.click(screen.getByText('Remover para o Inventário'));
    expect(screen.getByText('Confirmar desmontagem')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.getByText('Remover para o Inventário')).toBeInTheDocument();
  });

  it('move-to-warehouse requires a confirm click, then calls onMoveToVault with the machine id', async () => {
    const onMoveToVault = vi.fn().mockResolvedValue(undefined);
    render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot(), onMoveToVault })} />));
    fireEvent.click(screen.getByText('Enviar para o Armazém'));
    fireEvent.click(screen.getByText('Confirmar envio ao armazém'));
    await waitFor(() => expect(onMoveToVault).toHaveBeenCalledWith(99));
  });

  it('shows a toast and does not call onRemove when the rack id is invalid', async () => {
    const { toast } = await import('sonner');
    const onRemove = vi.fn();
    render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot({ rack: null }), onRemove })} />));
    fireEvent.click(screen.getByText('Remover para o Inventário'));
    fireEvent.click(screen.getByText('Confirmar desmontagem'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('shows a toast and does not call onMoveToVault when the machine id is invalid', async () => {
    const { toast } = await import('sonner');
    const onMoveToVault = vi.fn();
    render(
      withProviders(
        <SlotModal
          {...baseProps({ slot: occupiedSlot({ miner: { ...occupiedSlot().miner!, id: -1 } }), onMoveToVault })}
        />,
      ),
    );
    fireEvent.click(screen.getByText('Enviar para o Armazém'));
    fireEvent.click(screen.getByText('Confirmar envio ao armazém'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
    expect(onMoveToVault).not.toHaveBeenCalled();
  });

  it('the move-to-warehouse button is disabled when the machine id is not finite', () => {
    render(
      withProviders(
        <SlotModal {...baseProps({ slot: occupiedSlot({ miner: { ...occupiedSlot().miner!, id: NaN } }) })} />,
      ),
    );
    expect(screen.getByText('Enviar para o Armazém').closest('button')).toBeDisabled();
  });

  it('all action buttons are disabled while actionBusy is true', () => {
    render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot(), actionBusy: true })} />));
    for (const label of ['Remover para o Inventário', 'Enviar para o Armazém']) {
      expect(screen.getByText(label).closest('button')).toBeDisabled();
    }
  });

  it('the close button calls onClose, and does nothing while actionBusy', () => {
    const onClose = vi.fn();
    const { rerender } = render(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot(), onClose })} />));
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(withProviders(<SlotModal {...baseProps({ slot: occupiedSlot(), onClose, actionBusy: true })} />));
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SlotModal — empty slot (install view)', () => {
  it('shows the empty-inventory message when there is nothing to install', () => {
    render(withProviders(<SlotModal {...baseProps({ slot: emptySlot(), groupedInventory: [] })} />));
    expect(screen.getByText('Instalar Equipamento')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma máquina disponível.')).toBeInTheDocument();
  });

  it('lists inventory groups and installs the picked one into the rack', async () => {
    const onInstall = vi.fn().mockResolvedValue(undefined);
    const g = group({ id: 5, minerName: 'Basic Miner', quantity: 2 });
    render(withProviders(<SlotModal {...baseProps({ slot: emptySlot(), groupedInventory: [g], onInstall })} />));
    fireEvent.click(screen.getByText('Basic Miner'));
    await waitFor(() => expect(onInstall).toHaveBeenCalledWith(10, 5));
  });

  it('rejects a 2-slot machine that does not fit the visual slot, without calling onInstall', async () => {
    const { toast } = await import('sonner');
    const onInstall = vi.fn();
    // position 3 is the row-edge case machines.shared already covers as "won't fit".
    const g = group({ id: 5, minerName: 'Big Rig', slotSize: 2 });
    render(
      withProviders(
        <SlotModal
          {...baseProps({ slot: emptySlot({ rack: rack({ id: 10, position: 3 }) }), groupedInventory: [g], onInstall })}
        />,
      ),
    );
    fireEvent.click(screen.getByText('Big Rig'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Máquinas de 2 slots precisam começar antes do fim da linha. Use o slot anterior.'));
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('shows a toast and does not install when the rack id is invalid (rack present but id <= 0)', async () => {
    const { toast } = await import('sonner');
    const onInstall = vi.fn();
    render(
      withProviders(
        <SlotModal
          {...baseProps({ slot: emptySlot({ rack: rack({ id: 0 }) }), groupedInventory: [group()], onInstall })}
        />,
      ),
    );
    fireEvent.click(screen.getByText('Basic Miner'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro'));
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('rejects when there is no rack at all (canMachineFitVisualSlot false on a null slot)', async () => {
    const { toast } = await import('sonner');
    const onInstall = vi.fn();
    render(
      withProviders(
        <SlotModal {...baseProps({ slot: emptySlot({ rack: null }), groupedInventory: [group()], onInstall })} />,
      ),
    );
    fireEvent.click(screen.getByText('Basic Miner'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onInstall).not.toHaveBeenCalled();
  });

  it('picks the first item with a positive id from the group, ignoring optimistic negative-id placeholders', async () => {
    const onInstall = vi.fn().mockResolvedValue(undefined);
    const g: InventoryStackGroup = {
      id: -1,
      minerId: 1,
      minerName: 'Mixed',
      hashRate: 10,
      slotSize: 1,
      quantity: 2,
      items: [
        { id: -1, minerId: 1, minerName: 'Mixed', hashRate: 10 },
        { id: 7, minerId: 1, minerName: 'Mixed', hashRate: 10 },
      ],
    };
    render(withProviders(<SlotModal {...baseProps({ slot: emptySlot(), groupedInventory: [g], onInstall })} />));
    fireEvent.click(screen.getByText('Mixed'));
    await waitFor(() => expect(onInstall).toHaveBeenCalledWith(10, 7));
  });

  it('shows a "load more" button and reveals more groups when clicked', () => {
    const groups = Array.from({ length: 25 }, (_, i) => group({ id: i + 1, minerName: `Miner ${i + 1}` }));
    render(withProviders(<SlotModal {...baseProps({ slot: emptySlot(), groupedInventory: groups })} />));
    expect(screen.queryByText('Miner 25')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Carregar mais'));
    expect(screen.getByText('Miner 25')).toBeInTheDocument();
  });

  it('install-list buttons are disabled while actionBusy', () => {
    render(withProviders(<SlotModal {...baseProps({ slot: emptySlot(), groupedInventory: [group()], actionBusy: true })} />));
    expect(screen.getByText('Basic Miner').closest('button')).toBeDisabled();
  });

  it('resets confirmation/busy/pagination state when the slot changes', () => {
    const groups = Array.from({ length: 25 }, (_, i) => group({ id: i + 1, minerName: `Miner ${i + 1}` }));
    const { rerender } = render(withProviders(<SlotModal {...baseProps({ slot: emptySlot(), groupedInventory: groups })} />));
    fireEvent.click(screen.getByText('Carregar mais'));
    expect(screen.getByText('Miner 25')).toBeInTheDocument();

    rerender(withProviders(<SlotModal {...baseProps({ slot: emptySlot({ visualRackNumber: 3 }), groupedInventory: groups })} />));
    expect(screen.queryByText('Miner 25')).not.toBeInTheDocument();
  });
});
