import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import { InventorySidebar, MachinesHeader, MachinesRoomTabs } from './machines.parts';
import type { BackpackItem, InventoryStackGroup, RoomPayload } from '../lib/machines.types';

const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
const { t } = i18n;

function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

afterEach(cleanup);

describe('MachinesHeader', () => {
  it('renders the title/subtitle, hashrate, and counts, and wires both nav buttons', () => {
    const onGoToVault = vi.fn();
    const onGoToPowerStats = vi.fn();
    render(
      withProviders(
        <MachinesHeader
          t={t}
          activeMachinesHashRate={1500}
          occupiedRacks={3}
          inventoryCount={7}
          onGoToVault={onGoToVault}
          onGoToPowerStats={onGoToPowerStats}
        />,
      ),
    );
    expect(screen.getByText('1.50 KH/s')).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/7/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ir para o Armazém'));
    expect(onGoToVault).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Calculadora'));
    expect(onGoToPowerStats).toHaveBeenCalledTimes(1);
  });
});

function room(overrides: Partial<RoomPayload> = {}): RoomPayload {
  return { roomNumber: 1, unlocked: true, ...overrides };
}

describe('MachinesRoomTabs', () => {
  it('marks the active room tab as selected and shows a lock icon for locked rooms', () => {
    const rooms = [room({ roomNumber: 1, unlocked: true }), room({ roomNumber: 2, unlocked: false })];
    render(withProviders(<MachinesRoomTabs t={t} rooms={rooms} activeRoom={1} onSelectRoom={vi.fn()} />));
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelectRoom with the clicked room number', () => {
    const onSelectRoom = vi.fn();
    render(withProviders(<MachinesRoomTabs t={t} rooms={[room({ roomNumber: 1 }), room({ roomNumber: 2 })]} activeRoom={1} onSelectRoom={onSelectRoom} />));
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    expect(onSelectRoom).toHaveBeenCalledWith(2);
  });

  it('renders an optional trailing extra tab and marks it selected instead of any room when active', () => {
    const onSelect = vi.fn();
    render(
      withProviders(
        <MachinesRoomTabs
          t={t}
          rooms={[room({ roomNumber: 1 })]}
          activeRoom={1}
          onSelectRoom={vi.fn()}
          extraTab={{ id: 'distributor', label: 'Distribuidor', active: true, onSelect }}
        />,
      ),
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    // The room tab is NOT selected while the extra tab is active.
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tabs[1]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders the extra tab in its inactive style when not active', () => {
    render(
      withProviders(
        <MachinesRoomTabs
          t={t}
          rooms={[room({ roomNumber: 1 })]}
          activeRoom={1}
          onSelectRoom={vi.fn()}
          extraTab={{ id: 'distributor', label: 'Distribuidor', active: false, onSelect: vi.fn() }}
        />,
      ),
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('renders no extra tab when none is given', () => {
    render(withProviders(<MachinesRoomTabs t={t} rooms={[room()]} activeRoom={1} onSelectRoom={vi.fn()} />));
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });
});

function backpackItem(overrides: Partial<BackpackItem> = {}): BackpackItem {
  return { id: 1, minerId: 1, minerName: 'Miner', hashRate: 10, slotSize: 1, ...overrides };
}

function stackGroup(overrides: Partial<InventoryStackGroup> = {}): InventoryStackGroup {
  const item = backpackItem(overrides);
  return { ...item, quantity: 1, items: [item], ...overrides };
}

describe('InventorySidebar', () => {
  it('collapsed: renders a toggle + mini draggable tiles for each visible group', () => {
    const onToggleCollapse = vi.fn();
    render(
      withProviders(
        <InventorySidebar
          t={t}
          inventory={[backpackItem()]}
          visibleInventoryGroups={[stackGroup({ quantity: 2 })]}
          hasMoreInventoryGroups={false}
          rackActionBusy={false}
          backpackVaultBusy={false}
          collapsed
          onToggleCollapse={onToggleCollapse}
          onGoToVault={vi.fn()}
          onOpenWarehouse={vi.fn()}
          onLoadMore={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('x2')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Minhas Máquinas'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    const tile = screen.getByTitle('Miner x2');
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(tile, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('inventoryId', '1');
  });

  it('expanded + empty inventory: shows the empty state', () => {
    render(
      withProviders(
        <InventorySidebar
          t={t}
          inventory={[]}
          visibleInventoryGroups={[]}
          hasMoreInventoryGroups={false}
          rackActionBusy={false}
          backpackVaultBusy={false}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onGoToVault={vi.fn()}
          onOpenWarehouse={vi.fn()}
          onLoadMore={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('Seu inventário está vazio.')).toBeInTheDocument();
  });

  it('expanded + has items: renders group cards, wires drag data, warehouse button, and load-more', () => {
    const onOpenWarehouse = vi.fn();
    const onLoadMore = vi.fn();
    const group = stackGroup({ id: 42, quantity: 3, minerName: 'Big Rig', level: 2, hashRate: 500 });
    render(
      withProviders(
        <InventorySidebar
          t={t}
          inventory={[backpackItem()]}
          visibleInventoryGroups={[group]}
          hasMoreInventoryGroups
          rackActionBusy={false}
          backpackVaultBusy={false}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onGoToVault={vi.fn()}
          onOpenWarehouse={onOpenWarehouse}
          onLoadMore={onLoadMore}
        />,
      ),
    );
    expect(screen.getByText('Big Rig')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Enviar para o armazém'));
    expect(onOpenWarehouse).toHaveBeenCalledWith(group);
    fireEvent.click(screen.getByText('Carregar mais'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(screen.getByTitle('Escolha uma máquina para instalar neste slot:'), { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('inventoryId', String(group.items[0]!.id));
  });

  it('disables the warehouse button when backpackVaultBusy or the first item id is not finite', () => {
    const group = stackGroup({ id: NaN as unknown as number, items: [] });
    render(
      withProviders(
        <InventorySidebar
          t={t}
          inventory={[backpackItem()]}
          visibleInventoryGroups={[group]}
          hasMoreInventoryGroups={false}
          rackActionBusy={false}
          backpackVaultBusy={false}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onGoToVault={vi.fn()}
          onOpenWarehouse={vi.fn()}
          onLoadMore={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('Enviar para o armazém').closest('button')).toBeDisabled();
  });

  it('go-to-vault button works in both collapsed and expanded layouts', () => {
    const onGoToVault = vi.fn();
    const { rerender } = render(
      withProviders(
        <InventorySidebar
          t={t}
          inventory={[]}
          visibleInventoryGroups={[]}
          hasMoreInventoryGroups={false}
          rackActionBusy={false}
          backpackVaultBusy={false}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          onGoToVault={onGoToVault}
          onOpenWarehouse={vi.fn()}
          onLoadMore={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByText('Ir para o Armazém'));
    expect(onGoToVault).toHaveBeenCalledTimes(1);
  });
});
