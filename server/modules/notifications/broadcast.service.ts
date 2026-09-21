/**
 * Broadcast messages (site-wide announcements) — fused into notifications/ module.
 * Ported from legacy/server/modules/broadcast/*.
 * Deviation: image upload returns 501 (media module not ported).
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function getActiveBroadcastForUser(userId: number) {
  return prisma.broadcastMessage.findFirst({
    where: { isActive: true, views: { none: { userId } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function dismissBroadcastForUser(userId: number, messageId: number): Promise<void> {
  await prisma.broadcastMessageView.upsert({
    where: { userId_messageId: { userId, messageId } },
    update: {},
    create: { userId, messageId },
  });
}

export async function listBroadcastMessages() {
  return prisma.broadcastMessage.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { views: true } } },
  });
}

export async function deactivateAllBroadcastMessages(): Promise<void> {
  await prisma.broadcastMessage.updateMany({ data: { isActive: false } });
}

export async function deactivateOtherBroadcastMessages(excludeId: number): Promise<void> {
  await prisma.broadcastMessage.updateMany({ where: { id: { not: excludeId } }, data: { isActive: false } });
}

export async function createBroadcastMessage(data: Prisma.BroadcastMessageCreateInput) {
  return prisma.broadcastMessage.create({ data });
}

export async function updateBroadcastMessage(id: number, data: Prisma.BroadcastMessageUpdateInput) {
  return prisma.broadcastMessage.update({ where: { id }, data });
}

export async function findBroadcastMessageById(id: number) {
  return prisma.broadcastMessage.findUnique({
    where: { id },
    include: { _count: { select: { views: true } } },
  });
}

export async function resetBroadcastViews(messageId: number): Promise<number> {
  const result = await prisma.broadcastMessageView.deleteMany({
    where: { messageId },
  });
  return result.count;
}

export async function deleteBroadcastMessage(id: number): Promise<void> {
  await prisma.broadcastMessage.delete({ where: { id } });
}
