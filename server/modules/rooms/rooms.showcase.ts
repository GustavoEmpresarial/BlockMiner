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

/** Global switch. SHOWCASE_3D_ROOM_ENABLED=1 lists the room for every user. */
export const SHOWCASE_3D_ROOM_ENABLED_ENV_KEY = "SHOWCASE_3D_ROOM_ENABLED";

/**
 * Extra allowlist, used only while the global switch is off.
 * Comma-separated positive integer user ids. Empty means nobody extra.
 * Example: SHOWCASE_3D_ROOM_USER_IDS=1001,1002
 */
export const SHOWCASE_3D_ROOM_USER_IDS_ENV_KEY = "SHOWCASE_3D_ROOM_USER_IDS";

const SHOWCASE_USER_ID_TOKEN = /^[1-9][0-9]*$/;

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

/** Positive integer ids. Invalid tokens are skipped and never throw. */
export function readShowcaseRoomUserIds(
  raw: string | undefined | null = process.env[SHOWCASE_3D_ROOM_USER_IDS_ENV_KEY],
): ReadonlySet<number> {
  const ids = new Set<number>();
  if (raw == null) return ids;
  for (const part of String(raw).split(",")) {
    const token = part.trim();
    if (!SHOWCASE_USER_ID_TOKEN.test(token)) continue;
    const id = Number(token);
    if (!Number.isSafeInteger(id)) continue;
    ids.add(id);
  }
  return ids;
}

/**
 * Global flag first, then the allowlist. A user outside both stays on the off path.
 * Does not log the list.
 */
export function isShowcaseRoomEnabledForUser(
  userId: number,
  enabledRaw: string | undefined | null = process.env[SHOWCASE_3D_ROOM_ENABLED_ENV_KEY],
  userIdsRaw: string | undefined | null = process.env[SHOWCASE_3D_ROOM_USER_IDS_ENV_KEY],
): boolean {
  if (isShowcaseRoomEnabled(enabledRaw)) return true;
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  return readShowcaseRoomUserIds(userIdsRaw).has(userId);
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

/**
 * Shop and offer SKU for the showcase rack. Not a rack credit.
 * Price is BLK, written as a decimal string the same way offer miners use priceBlk.
 */
export const SHOWCASE_RACK_SHOP_SKU = "showcase_3d_rack" as const;
export const SHOWCASE_RACK_SHOP_PRICE_BLK = "1.5";
export const SHOWCASE_RACK_OFFER_PRICE_BLK = "0.95";
export const SHOWCASE_RACK_OFFER_LIST_PRICE_BLK = "1.5";

export const SHOWCASE_RACK_NAME_KEY = "racks.showcase_3d_name";
export const SHOWCASE_RACK_DESCRIPTION_KEY = "racks.showcase_3d_desc";

export function isShowcaseRackShopSku(value: string): boolean {
  return value === SHOWCASE_RACK_SHOP_SKU;
}

export function showcaseRackPriceBlk(channel: "shop" | "offer"): string {
  return channel === "offer" ? SHOWCASE_RACK_OFFER_PRICE_BLK : SHOWCASE_RACK_SHOP_PRICE_BLK;
}

export function showcaseRackListPriceBlk(channel: "shop" | "offer"): string {
  return channel === "offer" ? SHOWCASE_RACK_OFFER_LIST_PRICE_BLK : SHOWCASE_RACK_SHOP_PRICE_BLK;
}

export type ShowcaseRackListing = {
  sku: typeof SHOWCASE_RACK_SHOP_SKU;
  nameKey: string;
  descriptionKey: string;
  price: number;
  listPrice: number;
  priceBlk: string;
  listPriceBlk: string;
  currency: "BLK";
  imageUrl: string;
  creditsPerUnit: 0;
  salesAvailableAt: string;
  isPurchaseLive: true;
  maxQuantity: number;
};

/** Null when the same room allowlist would hide the 3D room. No second rule. */
export function showcaseRackListingForUser(
  userId: number,
  channel: "shop" | "offer",
): ShowcaseRackListing | null {
  if (!isShowcaseRoomEnabledForUser(userId)) return null;
  const priceBlk = showcaseRackPriceBlk(channel);
  const listPriceBlk = showcaseRackListPriceBlk(channel);
  return {
    sku: SHOWCASE_RACK_SHOP_SKU,
    nameKey: SHOWCASE_RACK_NAME_KEY,
    descriptionKey: SHOWCASE_RACK_DESCRIPTION_KEY,
    price: Number(priceBlk),
    listPrice: Number(listPriceBlk),
    priceBlk,
    listPriceBlk,
    currency: "BLK",
    imageUrl: SHOWCASE_RACK_IMAGE_URL,
    creditsPerUnit: 0,
    salesAvailableAt: new Date(0).toISOString(),
    isPurchaseLive: true,
    maxQuantity: SHOWCASE_RACKS_PER_ROOM,
  };
}
