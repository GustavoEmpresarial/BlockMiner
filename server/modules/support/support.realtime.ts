// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { toPublicSupportReply } from "./support.payload.js";
let ioRef = null;
export function setSupportIo(io) {
    ioRef = io;
}
export function getSupportIo() {
    return ioRef;
}
export function emitSupportReply(supportMessageId, replyRow) {
    if (!ioRef || !supportMessageId)
        return;
    const payload = toPublicSupportReply(replyRow);
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
export function emitUserNotification(userId, notification) {
    if (!ioRef || !userId)
        return;
    ioRef.to(`user:${userId}`).emit("notification:new", notification);
}
