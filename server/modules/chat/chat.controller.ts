import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as chatService from "./chat.service.js";

const log = logger.child("chat.controller");

/** item 95 (pentest A4): sem limite antes, só checava não-vazio. */
const MAX_MESSAGE_LENGTH = 2000;

export async function getMessages(_req: Request, res: Response): Promise<void> {
  try {
    const messages = await chatService.listMessages();
    res.json({ ok: true, messages });
  } catch (e: unknown) {
    log.error("Failed to fetch chat messages", { error: String(e) });
    res.status(500).json({ ok: false, message: "Unable to load messages." });
  }
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { message, replyToId } = req.body as { message?: unknown; replyToId?: unknown };
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ ok: false, message: "Message cannot be empty." });
      return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ ok: false, message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters).` });
      return;
    }
    const chatMsg = await chatService.sendPublicMessage({
      userId: user.id,
      username: user.username || user.name,
      message,
      replyToId: replyToId ? Number(replyToId) : null,
    });
    res.json({ ok: true, message: chatMsg });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "EMPTY_CHAT_MESSAGE") {
      res.status(400).json({ ok: false, message: "Message cannot be empty." });
      return;
    }
    log.error("Failed to send message", { error: String(e) });
    res.status(500).json({ ok: false, message: "Unable to send message." });
  }
}

export async function getActiveUsers(_req: Request, res: Response): Promise<void> {
  try {
    const usernames = await chatService.listActiveUsernames();
    res.json({ ok: true, usernames });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to fetch users." });
  }
}

export async function getPrivateMessages(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const targetUserId = Number(req.params.targetUserId);
    if (!Number.isInteger(targetUserId) || targetUserId < 1) {
      res.status(400).json({ ok: false, message: "Invalid target user." });
      return;
    }
    const messages = await chatService.getPrivateThread(user.id, targetUserId);
    res.json({ ok: true, messages });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load private messages." });
  }
}

export async function sendPrivateMessage(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const { receiverId, message } = req.body as { receiverId?: unknown; message?: unknown };
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ ok: false, message: "Message is empty." });
      return;
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ ok: false, message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters).` });
      return;
    }
    const rid = Number(receiverId);
    if (!Number.isInteger(rid) || rid < 1) {
      res.status(400).json({ ok: false, message: "Invalid receiver." });
      return;
    }
    const pm = await chatService.sendPrivate({
      senderId: user.id,
      senderName: user.username || user.name,
      receiverId: rid,
      message,
    });
    // item 95 (pentest A2) + item 100 (achado #1, resíduo): pm===null (receiver
    // inexistente) tinha o MESMO status 200 do sucesso, mas o corpo diferia
    // (`message: null` vs `message: {...}`) — ainda dava pra distinguir os dois casos e
    // enumerar usuários. Agora, se pm é null, devolve um objeto sintético com o MESMO
    // formato de uma mensagem real (nada é persistido) — corpo indistinguível nos dois casos.
    const responseMessage = pm ?? {
      id: 0,
      senderId: user.id,
      receiverId: rid,
      message: chatService.sanitizeChatPlainText(message),
      createdAt: new Date(),
      isRead: false,
    };
    res.json({ ok: true, message: responseMessage });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "EMPTY_CHAT_MESSAGE") {
      res.status(400).json({ ok: false, message: "Message is empty." });
      return;
    }
    log.error("Failed to send private message", { error: String(e) });
    res.status(500).json({ ok: false, message: "Unable to send private message." });
  }
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const conversations = await chatService.listConversations(user.id);
    res.json({ ok: true, conversations });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load conversations." });
  }
}
