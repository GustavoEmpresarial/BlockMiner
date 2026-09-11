import prisma from "../../core/database/prisma.js";

export async function listRecentChatMessages(take: number) {
  return prisma.chatMessage.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, username: true } },
      replyTo: { select: { id: true, username: true, message: true } },
    },
  });
}

export async function createChatMessage(data: {
  userId: number;
  username: string;
  message: string;
  replyToId: number | null;
  createdAt: Date;
}) {
  return prisma.chatMessage.create({
    data,
    include: { replyTo: { select: { id: true, username: true, message: true } } },
  });
}

export async function listRecentUsernames(take: number) {
  return prisma.chatMessage.findMany({
    take,
    orderBy: { createdAt: "desc" },
    select: { username: true },
  });
}

export async function listPrivateMessagesBetween(userId: number, targetUserId: number, take: number) {
  return prisma.privateMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: targetUserId },
        { senderId: targetUserId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export async function markPrivateMessagesRead(fromUserId: number, toUserId: number): Promise<void> {
  await prisma.privateMessage.updateMany({
    where: { senderId: fromUserId, receiverId: toUserId, isRead: false },
    data: { isRead: true },
  });
}

/** item 95 (pentest A2): checagem leve de existência antes do create — ver chat.service.ts. */
export async function userExistsForChat(userId: number): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return row != null;
}

export async function createPrivateMessage(data: { senderId: number; receiverId: number; message: string }) {
  return prisma.privateMessage.create({ data });
}

export async function listSentPrivateMessages(userId: number) {
  return prisma.privateMessage.findMany({
    where: { senderId: userId },
    select: { receiverId: true, receiver: { select: { username: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listReceivedPrivateMessages(userId: number) {
  return prisma.privateMessage.findMany({
    where: { receiverId: userId },
    select: { senderId: true, sender: { select: { username: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
