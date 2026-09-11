/**
 * Ported from legacy/server/modules/chat/chat.controller.ts (business bits).
 * Deviation: Socket.IO emits are no-ops (core/socket not built). Persist still happens.
 */
import { createNotification } from "../notifications/index.js";
import * as chatRepo from "./chat.repository.js";
import { escapeHtml, sanitizeChatPlainText } from "../../shared/utils/htmlEscape.js";

export { escapeHtml, sanitizeChatPlainText };

export async function listMessages() {
  const messages = await chatRepo.listRecentChatMessages(50);
  return messages.reverse();
}

export async function listActiveUsernames() {
  const recent = await chatRepo.listRecentUsernames(100);
  return [...new Set(recent.map((m) => m.username))];
}

export async function sendPublicMessage(args: {
  userId: number;
  username: string;
  message: string;
  replyToId?: number | null;
}) {
  const sanitized = sanitizeChatPlainText(args.message);
  if (!sanitized) {
    throw Object.assign(new Error("EMPTY_CHAT_MESSAGE"), { code: "EMPTY_CHAT_MESSAGE" });
  }
  return chatRepo.createChatMessage({
    userId: args.userId,
    username: args.username,
    message: sanitized,
    replyToId: args.replyToId ?? null,
    createdAt: new Date(),
  });
  // socket chat:new-message — skipped (no core/socket)
}

export async function getPrivateThread(userId: number, targetUserId: number) {
  const messages = await chatRepo.listPrivateMessagesBetween(userId, targetUserId, 50);
  await chatRepo.markPrivateMessagesRead(targetUserId, userId);
  return messages;
}

/**
 * item 95 (pentest A2): `receiverId` é checado ANTES do create — antes disto, um
 * `receiverId` inexistente estourava a FK constraint do Prisma e caía no catch genérico do
 * controller como 500, enquanto um `receiverId` real respondia 200. Essa diferença era um
 * oráculo de enumeração de usuários (IDs sequenciais). Agora devolve `null` silenciosamente
 * pra receiver inexistente — o controller responde a MESMA forma de sucesso pros dois casos.
 */
export async function sendPrivate(args: {
  senderId: number;
  senderName: string;
  receiverId: number;
  message: string;
}) {
  const receiverExists = await chatRepo.userExistsForChat(args.receiverId);
  if (!receiverExists) return null;

  const sanitized = sanitizeChatPlainText(args.message);
  if (!sanitized) {
    throw Object.assign(new Error("EMPTY_CHAT_MESSAGE"), { code: "EMPTY_CHAT_MESSAGE" });
  }
  const pm = await chatRepo.createPrivateMessage({
    senderId: args.senderId,
    receiverId: args.receiverId,
    message: sanitized,
  });
  await createNotification({
    userId: args.receiverId,
    title: "Nova Mensagem Privada",
    message: `Você recebeu uma mensagem de ${args.senderName}.`,
    type: "info",
  });
  // socket chat:new-pm — skipped
  return pm;
}

export async function listConversations(userId: number) {
  const sent = await chatRepo.listSentPrivateMessages(userId);
  const received = await chatRepo.listReceivedPrivateMessages(userId);
  const conversationMap = new Map<number, { userId: number; username: string | null | undefined; lastMessageAt: Date }>();

  for (const msg of sent) {
    const otherId = msg.receiverId;
    const prev = conversationMap.get(otherId);
    if (!prev || prev.lastMessageAt < msg.createdAt) {
      conversationMap.set(otherId, {
        userId: otherId,
        username: msg.receiver?.username,
        lastMessageAt: msg.createdAt,
      });
    }
  }
  for (const msg of received) {
    const otherId = msg.senderId;
    const prev = conversationMap.get(otherId);
    if (!prev || prev.lastMessageAt < msg.createdAt) {
      conversationMap.set(otherId, {
        userId: otherId,
        username: msg.sender?.username,
        lastMessageAt: msg.createdAt,
      });
    }
  }

  return Array.from(conversationMap.values()).sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
  );
}
