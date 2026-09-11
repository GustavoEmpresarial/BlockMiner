import {
  getRoomOfferWindow,
  getRoomPriceQuote,
  isRoomOfferActiveAt,
  readRoomOfferDescription,
  readRoomOfferImageUrl,
  readRoomOfferTitle,
  ROOM_CURRENCY,
} from "./rooms.config.js";
import { ROOM_MAX } from "./rooms.types.js";

export type RoomOfferItemPublic = {
  roomNumber: number;
  price: number;
  listPrice: number;
  currency: typeof ROOM_CURRENCY;
  discountPercent: number;
  imageUrl: string;
};

export type RoomOffersPublic = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  isLive: boolean;
  currency: typeof ROOM_CURRENCY;
  rooms: RoomOfferItemPublic[];
};

export type BuildActiveRoomOffersOptions = {
  /** Rooms already unlocked (1 = only starter room). When set, only the next sequential room is advertised. */
  unlockedRoomCount?: number;
};

export function buildActiveRoomOffersPayload(
  now: Date = new Date(),
  options?: BuildActiveRoomOffersOptions,
): RoomOffersPublic | null {
  if (!isRoomOfferActiveAt(now)) return null;
  const window = getRoomOfferWindow();
  if (!window) return null;

  const rooms: RoomOfferItemPublic[] = [];
  for (let n = 1; n <= ROOM_MAX; n++) {
    const quote = getRoomPriceQuote(n, now);
    if (!quote.onOffer || quote.listPrice <= 0) continue;
    rooms.push({
      roomNumber: n,
      price: quote.price,
      listPrice: quote.listPrice,
      currency: quote.currency,
      discountPercent: Math.round((1 - quote.price / quote.listPrice) * 100),
      imageUrl: readRoomOfferImageUrl(n),
    });
  }

  let visibleRooms = rooms;
  if (options?.unlockedRoomCount !== undefined) {
    const nextRoom = options.unlockedRoomCount + 1;
    if (nextRoom > ROOM_MAX) return null;
    visibleRooms = rooms.filter((room) => room.roomNumber === nextRoom);
  }

  if (visibleRooms.length === 0) return null;

  return {
    title: readRoomOfferTitle(),
    description: readRoomOfferDescription(),
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    isLive: true,
    currency: ROOM_CURRENCY,
    rooms: visibleRooms,
  };
}
