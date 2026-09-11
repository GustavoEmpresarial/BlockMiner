import prisma from "../../core/database/prisma.js";
export async function getActiveBroadcastForUser(userId) {
    return prisma.broadcastMessage.findFirst({
        where: { isActive: true, views: { none: { userId } } },
        orderBy: { createdAt: "desc" },
    });
}
export async function dismissBroadcastForUser(userId, messageId) {
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
export async function deactivateAllBroadcastMessages() {
    await prisma.broadcastMessage.updateMany({ data: { isActive: false } });
}
export async function deactivateOtherBroadcastMessages(excludeId) {
    await prisma.broadcastMessage.updateMany({ where: { id: { not: excludeId } }, data: { isActive: false } });
}
export async function createBroadcastMessage(data) {
    return prisma.broadcastMessage.create({ data });
}
export async function updateBroadcastMessage(id, data) {
    return prisma.broadcastMessage.update({ where: { id }, data });
}
export async function deleteBroadcastMessage(id) {
    await prisma.broadcastMessage.delete({ where: { id } });
}
