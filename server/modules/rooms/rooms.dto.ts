/**
 * Room list payload builders — ported from legacy rooms.dto.ts.
 */
import { resolveOwnedMachineImageUrl } from "../inventory/index.js";
import { resolveOwnedMachineDisplay } from "../machines/ownedMachineDisplay.js";
import { getRoomPriceQuote, readRoomListPrices } from "./rooms.config.js";
import { ROOM_MAX, type ListedRoomPayload, type RoomListQueryRow } from "./rooms.types.js";

export function getRoomPrices(): number[] {
  return readRoomListPrices();
}

type RackMinerRow = NonNullable<RoomListQueryRow["racks"][number]["userMiner"]>;

function mapRackMiner(um: RackMinerRow) {
  const display = resolveOwnedMachineDisplay({
    minerId: um.minerId,
    rowImageUrl: um.imageUrl,
    catalogName: um.miner?.name,
    catalogImageUrl: um.miner?.imageUrl,
    ownedName: um.ownedMachine?.minerName,
    ownedImageUrl: um.ownedMachine?.imageUrl,
    eventName: um.ownedMachine?.eventMiner?.name,
    eventImageUrl: um.ownedMachine?.eventMiner?.imageUrl,
  });
  const { imageUrl, imageSource } = resolveOwnedMachineImageUrl({
    rowImageUrl: um.imageUrl,
    ownedMachineImageUrl: display.imageUrl,
    catalogImageUrl: um.miner?.imageUrl ?? um.ownedMachine?.eventMiner?.imageUrl ?? null,
  });
  return {
    id: um.id,
    minerId: um.minerId,
    minerName: display.minerName,
    hashRate: um.hashRate,
    imageUrl,
    imageSource,
    ownedMachineId: um.ownedMachineId,
    level: um.level,
    slotSize: um.slotSize,
  };
}

export function buildListedRoomsPayload(
  rooms: RoomListQueryRow[],
  _listPrices?: number[],
  now: Date = new Date(),
): ListedRoomPayload[] {
  const result: ListedRoomPayload[] = [];
  for (let n = 1; n <= ROOM_MAX; n++) {
    const found = rooms.find((r) => r.roomNumber === n);
    if (found) {
      result.push({
        id: found.id,
        roomNumber: found.roomNumber,
        unlocked: true,
        pricePaid: Number(found.pricePaid),
        unlockedAt: found.unlockedAt,
        racks: found.racks.map((rack) => ({
          id: rack.id,
          position: rack.position,
          installedAt: rack.installedAt || null,
          blockedByMinerId: rack.blockedByMinerId || null,
          miner: rack.userMiner ? mapRackMiner(rack.userMiner) : null,
        })),
      });
    } else {
      const quote = getRoomPriceQuote(n, now);
      const locked: ListedRoomPayload = {
        roomNumber: n,
        unlocked: false,
        price: quote.price,
        priceCurrency: quote.currency,
        racks: [],
      };
      if (quote.onOffer) {
        locked.listPrice = quote.listPrice;
        locked.onOffer = true;
      }
      result.push(locked);
    }
  }
  return result;
}

export function countRackTotals(rooms: RoomListQueryRow[]) {
  const totalRacks = rooms.reduce((s, r) => s + r.racks.length, 0);
  const occupiedRacks = rooms.reduce(
    (s, r) =>
      s +
      r.racks.filter((rack) => rack.userMinerId != null || rack.blockedByMinerId != null).length,
    0,
  );
  return { totalRacks, occupiedRacks, freeRacks: totalRacks - occupiedRacks };
}
