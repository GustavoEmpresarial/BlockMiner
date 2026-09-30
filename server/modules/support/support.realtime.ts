import type { Server } from "socket.io";
import { toPublicSupportReply } from "./support.payload.js";

let ioRef: Server | null = null;

export function setSupportIo(io: Server): void {
  ioRef = io;
}

export function getSupportIo(): Server | null {
  return ioRef;
}

export function emitSupportReply(supportMessageId: number, replyRow: Record<string, unknown>): void {
  if (!ioRef || !supportMessageId) return;
  const payload = toPublicSupportReply(replyRow as Parameters<typeof toPublicSupportReply>[0]);
  ioRef.to(`support:${supportMessageId}`).emit("support:reply", {
    supportMessageId,
    reply: payload,
  });
}

/**
 * Live push for the notification bell/toast — mirrors the `user:${userId}` room convention
 * mining.socket.ts already joins every connected socket to. createNotification() (notifications
 * module) only persists to DB; without this push the user only ever sees a new admin reply after
 * their next GET /api/notifications poll, never as an immediate pop-up (PROGRESSO.txt item 52).
 */
export function emitUserNotification(userId: number, notification: unknown): void {
  if (!ioRef || !userId) return;
  ioRef.to(`user:${userId}`).emit("notification:new", notification);
}
