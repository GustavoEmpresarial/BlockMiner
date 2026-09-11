export { roomsRouter } from "./rooms.routes.js";
export {
  isRackSlotOccupied,
  isRowEdgeViolation,
  isTwoSlotSpillFromPrevious,
  rackSlotIndex,
} from "./rooms.placement.js";
export { normalizeRackIds } from "./rooms.schemas.js";
export {
  getRoomPrices,
  buildListedRoomsPayload,
  countRackTotals,
} from "./rooms.dto.js";
export {
  getRoomPriceQuote,
  isRoomOfferActiveAt,
  readRoomListPrices,
  ROOM_CURRENCY,
} from "./rooms.config.js";
export { buildActiveRoomOffersPayload } from "./rooms.offers.js";
export type { RoomOffersPublic, RoomOfferItemPublic } from "./rooms.offers.js";
export { ROOMS_ERROR } from "./rooms.errors.js";
export { provisionFirstRoomTx } from "./rooms.service.js";
export {
  RACKS_PER_ROOM,
  SLOTS_PER_VISUAL_RACK,
  STARTER_VISUAL_RACKS_ENV_KEY,
  DEFAULT_STARTER_VISUAL_RACKS,
  readStarterVisualRacks,
  starterRackSlotCount,
} from "./rooms.types.js";
