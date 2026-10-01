/**
 * Free showcase room for 3D miners. Up to 24 racks, two bays each, separate from rooms 1–4.
 */
import { ROOM_MAX } from "./rooms.types.js";

export const SHOWCASE_3D_ROOM_KIND = "showcase_3d" as const;
export const STANDARD_ROOM_KIND = "standard" as const;

/** Reserved so it never collides with ROOM_MAX (1–4) or rackSlotIndex of those rooms. */
export const SHOWCASE_3D_ROOM_NUMBER = 101;

export const SHOWCASE_RACK_BAYS = 2;
/** Same visual-rack count as a normal room (RACKS_PER_ROOM / 8). */
export const SHOWCASE_RACKS_PER_ROOM = 24;

export const SHOWCASE_RACK_PRICE_ENV_KEY = "SHOWCASE_RACK_PRICE";
export const DEFAULT_SHOWCASE_RACK_PRICE = 1;

/** Off until the 3D room is ready to show again. Set SHOWCASE_3D_ROOM_ENABLED=1 to list it. */
export const SHOWCASE_3D_ROOM_ENABLED_ENV_KEY = "SHOWCASE_3D_ROOM_ENABLED";

export const SHOWCASE_RACK_IMAGE_URL = "/media/racks/showcase-3d-rack-fit.svg";

export const MINERCORE_MCX9_MODEL_URL = "/media/models/minercore-mcx9.glb";

const SAFE_MODEL_URL = /^\/media\/models\/[a-z0-9][a-z0-9._-]*\.glb$/i;

export type ShowcaseMinerRef = {
  minerName?: string | null;
  imageUrl?: string | null;
  modelUrl?: string | null;
};

export function isShowcaseRoomEnabled(
  raw: string | undefined | null = process.env[SHOWCASE_3D_ROOM_ENABLED_ENV_KEY],
): boolean {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function readShowcaseRackPrice(
  raw: string | undefined | null = process.env[SHOWCASE_RACK_PRICE_ENV_KEY],
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_SHOWCASE_RACK_PRICE;
  const n = parseFloat(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`invalid ${SHOWCASE_RACK_PRICE_ENV_KEY} entry: ${raw}`);
  }
  return n;
}

export function isShowcaseRoom(room: { roomNumber?: number | null; kind?: string | null } | null | undefined): boolean {
  if (!room) return false;
  return room.kind === SHOWCASE_3D_ROOM_KIND || room.roomNumber === SHOWCASE_3D_ROOM_NUMBER;
}

/** Paid-sequence rooms only. The showcase row must not advance "next room". */
export function countStandardRooms(roomNumbers: number[], roomMax = ROOM_MAX): number {
  return roomNumbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= roomMax).length;
}

export function nextStandardRoomNumber(roomNumbers: number[], roomMax = ROOM_MAX): number {
  return countStandardRooms(roomNumbers, roomMax) + 1;
}

export function showcaseVisualCount(rackRowCount: number): number {
  if (!Number.isFinite(rackRowCount) || rackRowCount <= 0) return 0;
  return Math.floor(rackRowCount / SHOWCASE_RACK_BAYS);
}

export function showcaseRackAtCapacity(rackRowCount: number): boolean {
  return showcaseVisualCount(rackRowCount) >= SHOWCASE_RACKS_PER_ROOM;
}

export type ShowcaseFloorChoice =
  | { ok: true; floorSlot: number }
  | { ok: false; code: "SHOWCASE_RACK_FULL" | "SHOWCASE_RACK_OCCUPIED" | "RACK_INVALID_PLACEMENT" };

/** First free floor pad, or the pad the user clicked. Same 24 pads as the other rooms. */
export function resolveShowcaseFloorSlot(
  requested: number | null | undefined,
  takenFloorSlots: number[],
): ShowcaseFloorChoice {
  const taken = new Set(
    takenFloorSlots.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < SHOWCASE_RACKS_PER_ROOM),
  );
  if (requested == null) {
    for (let slot = 0; slot < SHOWCASE_RACKS_PER_ROOM; slot += 1) {
      if (!taken.has(slot)) return { ok: true, floorSlot: slot };
    }
    return { ok: false, code: "SHOWCASE_RACK_FULL" };
  }
  if (!Number.isInteger(requested) || requested < 0 || requested >= SHOWCASE_RACKS_PER_ROOM) {
    return { ok: false, code: "RACK_INVALID_PLACEMENT" };
  }
  if (taken.has(requested)) return { ok: false, code: "SHOWCASE_RACK_OCCUPIED" };
  return { ok: true, floorSlot: requested };
}

/** Next rack origin, or null when the room is full or the bay rows are not aligned. */
export function nextShowcaseRackLayout(
  rackRowCount: number,
): { visualIndex: number; positions: number[] } | null {
  if (!Number.isInteger(rackRowCount) || rackRowCount < 0) return null;
  if (rackRowCount % SHOWCASE_RACK_BAYS !== 0) return null;
  const visualIndex = rackRowCount / SHOWCASE_RACK_BAYS;
  if (visualIndex >= SHOWCASE_RACKS_PER_ROOM) return null;
  const origin = visualIndex * SHOWCASE_RACK_BAYS;
  return {
    visualIndex,
    positions: Array.from({ length: SHOWCASE_RACK_BAYS }, (_, offset) => origin + offset),
  };
}

/** Same rule as the client rackMinerModelUrl: GLB path, MCX9 name, or MCX9 image. */
export function showcaseMinerModelUrl(machine: ShowcaseMinerRef | null | undefined): string | null {
  if (!machine) return null;
  const explicit = typeof machine.modelUrl === "string" ? machine.modelUrl.trim() : "";
  if (SAFE_MODEL_URL.test(explicit)) return explicit;
  const name = String(machine.minerName ?? "")
    .replace(/^\[event\]\s*/i, "")
    .trim();
  if (name === "MinerCore MCX9") return MINERCORE_MCX9_MODEL_URL;
  const image = String(machine.imageUrl ?? "");
  if (image.includes("/minercore-mcx9")) return MINERCORE_MCX9_MODEL_URL;
  return null;
}

export function isShowcase3dMiner(machine: ShowcaseMinerRef | null | undefined): boolean {
  return showcaseMinerModelUrl(machine) != null;
}

export type ShowcaseInstallDecision =
  | { ok: true; blockAdjacent: false }
  | { ok: false; code: "SHOWCASE_3D_ONLY" };

/** A 3D miner takes one bay. slotSize does not spill into the other bay. */
export function decideShowcaseInstall(machine: ShowcaseMinerRef | null | undefined): ShowcaseInstallDecision {
  if (!isShowcase3dMiner(machine)) return { ok: false, code: "SHOWCASE_3D_ONLY" };
  return { ok: true, blockAdjacent: false };
}
