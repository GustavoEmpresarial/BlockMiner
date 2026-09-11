// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Notifications persistence + best-effort create for cross-module use.
 * Deviation: Socket.IO not in current/ — createNotification persists only (no emit).
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
const log = logger.child("notifications.service");
export async function listNotificationsForUser(userId) {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
    });
}
export async function markNotificationAsRead(userId, idParam) {
    if (idParam === "all") {
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return;
    }
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1)
        throw new Error("INVALID_ID");
    await prisma.notification.update({
        where: { id, userId },
        data: { isRead: true },
    });
}
/** Creates a notification. Swallows errors — best-effort side effect (legacy parity). */
export async function createNotification(input) {
    try {
        return await prisma.notification.create({
            data: {
                userId: input.userId,
                title: input.title,
                message: input.message,
                type: input.type ?? "info",
            },
        });
    }
    catch (err) {
        log.warn("createNotification failed", {
            userId: input.userId,
            error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}
