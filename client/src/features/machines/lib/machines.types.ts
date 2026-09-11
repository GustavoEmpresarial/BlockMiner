export type MachineImageSource = 'catalog_current' | 'owned_snapshot' | 'none' | string;

export type BackpackItem = {
  id: number;
  minerId?: number | null;
  minerName?: string | null;
  level?: number | null;
  hashRate?: number | string | null;
  slotSize?: number | null;
  imageUrl?: string | null;
  imageSource?: MachineImageSource | null;
  catalogImageUrl?: string | null;
  ownedMachineImageUrl?: string | null;
  rowImageUrl?: string | null;
  apiImageUrl?: string | null;
  apiImageSource?: MachineImageSource | null;
};

export type InventoryStackGroup = BackpackItem & {
  quantity: number;
  items: BackpackItem[];
};

export type UserRackSlot = {
  id: number;
  position: number;
  miner?: {
    id: number;
    minerId?: number | null;
    minerName?: string | null;
    hashRate?: number | string | null;
    imageUrl?: string | null;
    imageSource?: MachineImageSource | null;
    ownedMachineId?: number | null;
    level?: number | null;
    slotSize?: number | null;
  } | null;
  installedAt?: string | null;
  blockedByMinerId?: number | null;
};

export type VisualRackGroup = {
  rackNumber: number;
  slots: UserRackSlot[];
};

export type RoomPayload = {
  id?: number;
  roomNumber: number;
  unlocked: boolean;
  racks?: UserRackSlot[];
  visualCount?: number;
};

export type RoomsSummaryState = {
  totalRacks: number;
  occupiedRacks: number;
  freeRacks: number;
};

export type SelectedSlotPayload = {
  rackId: number;
  roomNumber: number;
  slot: UserRackSlot;
};

export type VisualRackPlacement = {
  visualIndex: number;
  floorSlot: number | null;
};

export type MachineTipState = {
  rackId: number;
  x: number;
  y: number;
};
