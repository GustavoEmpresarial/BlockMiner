export const RACKS_PER_ROOM = parseInt(process.env.RACKS_PER_ROOM || "192", 10);
export const ROOM_MAX = parseInt(process.env.ROOM_MAX || "4", 10);
export const RACK_VISUAL_COLUMNS = 4;
export const SLOTS_PER_VISUAL_RACK = 8;

/** New accounts: how many visual racks (× {@link SLOTS_PER_VISUAL_RACK} slots) on first room. */
export const STARTER_VISUAL_RACKS_ENV_KEY = "STARTER_VISUAL_RACKS";
export const DEFAULT_STARTER_VISUAL_RACKS = 1;

export function readStarterVisualRacks(
  raw: string | undefined | null = process.env[STARTER_VISUAL_RACKS_ENV_KEY],
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_STARTER_VISUAL_RACKS;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_STARTER_VISUAL_RACKS;
  // Cap at full room grid so a bad env cannot over-provision beyond RACKS_PER_ROOM.
  return Math.min(n, Math.max(1, Math.floor(RACKS_PER_ROOM / SLOTS_PER_VISUAL_RACK)));
}

/** Slot rows created for room 1 at registration (1 visual rack → 8 machine slots by default). */
export function starterRackSlotCount(
  visualRacks: number = readStarterVisualRacks(),
): number {
  return visualRacks * SLOTS_PER_VISUAL_RACK;
}

export type RackMoveBackRow = { id: number; roomId: number; userId: number };

export type MinerWithMinerRel = {
  id: number;
  userId: number;
  minerId: number | null;
  level: number;
  hashRate: number;
  slotSize: number;
  imageUrl: string | null;
  ownedMachineId: number | null;
  miner: { name: string; imageUrl: string | null } | null;
  ownedMachine: {
    minerName: string;
    imageUrl: string | null;
    eventMiner?: { name: string; imageUrl: string | null } | null;
  } | null;
};

export type ListedRoomPayload =
  | {
      id: number;
      roomNumber: number;
      unlocked: true;
      pricePaid: number;
      unlockedAt: Date;
      racks: Array<{
        id: number;
        position: number;
        installedAt: Date | null;
        blockedByMinerId: number | null;
        miner: {
          id: number;
          minerId: number | null;
          minerName: string | null;
          hashRate: number;
          imageUrl: string | null;
          imageSource: "owned_snapshot" | "catalog_current" | "none";
          ownedMachineId: number | null;
          level: number;
          slotSize: number;
        } | null;
      }>;
    }
  | {
      roomNumber: number;
      unlocked: false;
      price: number;
      listPrice?: number;
      onOffer?: boolean;
      priceCurrency: "BLK";
      racks: [];
    };

export type RoomListQueryRow = {
  id: number;
  roomNumber: number;
  pricePaid: unknown;
  unlockedAt: Date;
  racks: Array<{
    id: number;
    position: number;
    installedAt: Date | null;
    blockedByMinerId: number | null;
    userMinerId: number | null;
    userMiner: {
      id: number;
      minerId: number | null;
      hashRate: number;
      imageUrl: string | null;
      level: number;
      slotSize: number;
      ownedMachineId: number | null;
      ownedMachine: {
        imageUrl: string | null;
        minerName: string;
        eventMiner?: { name: string; imageUrl: string | null } | null;
      } | null;
      miner: { name: string; imageUrl: string | null } | null;
    } | null;
  }>;
};
