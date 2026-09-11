export { supportRouter } from "./support.routes.js";
export { supportPublicRouter } from "./support.public.routes.js";
export { supportAdminRouter } from "./support.admin.routes.js";
export { SUPPORT_ERROR, SupportNotFoundError } from "./support.errors.js";
export {
  isAllowedUploadUrl,
  serializeSupportPayload,
  parseSupportPayload,
} from "./support.payload.js";
export { getSupportTicketPlayerDossier } from "./support.dossier.service.js";

/** Realtime — consumed only by core/socket/index.ts to register this module's socket handlers. */
export { registerSupportSocketHandlers } from "./support.socket.js";
export { emitSupportReply, setSupportIo, getSupportIo } from "./support.realtime.js";
