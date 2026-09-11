/**
 * Best-effort Socket.IO fan-out to a user's private room (`user:<id>`).
 * Callers must not fail the HTTP/transaction path when the socket layer is unavailable.
 */
import { getIo } from "./index.js";

export function emitToUser(userId: number, event: string, payload?: unknown): void {
  if (!Number.isInteger(userId) || userId < 1) return;
  const io = getIo();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload ?? {});
}

/** Notify clients that backpack / owned machines changed (reward inbox collect, shop, vault, etc.). */
export function emitUserInventoryUpdate(userId: number): void {
  emitToUser(userId, "inventory:update");
}
