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
  /** BLK unlock price + optional promo fields — only meaningful while `unlocked` is false. */
  price?: number;
  listPrice?: number;
  onOffer?: boolean;
};

export type RoomsSummaryState = {
  totalRacks: number;
  occupiedRacks: number;
  freeRacks: number;
};

/**
 * What ImageRackCard actually passes to onSlotClick (see
 * inventory2/components/ImageRackCard.tsx) and SlotModal actually consumes — this
 * type used to declare `{ rackId, roomNumber, slot }`, a shape nothing in the
 * codebase produced or read; fixed 2026-09-12 to match the real, live contract.
 */
export type SelectedSlotPayload = {
  rack: UserRackSlot | null | undefined;
  miner: UserRackSlot['miner'];
  visualRackNumber: number;
  slotInRack: number;
};

export type VisualRackPlacement = {
  visualIndex: number;
  floorSlot: number | null;
};

/**
 * What ImageRackCard's rack-slot hover tooltip actually tracks (see
 * inventory2/components/ImageRackCard.tsx's showMachineTipNow/scheduleShowMachineTip) —
 * this type used to declare `{ rackId, x, y }`, a shape nothing produced or read;
 * fixed 2026-09-12 to match the real, live contract.
 */
export type MachineTipState = {
  anchorEl: HTMLElement;
  slotKey: number;
  displayName: string;
  hashrateStr: string;
  slotSize: number;
};
