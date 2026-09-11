/**
 * Ported from legacy support + publicSupport services.
 *
 * Deviations:
 * - Telegram notifiers: legacy used a standalone long-polling bot (telegram/notifiers/
 *   support.notifier.ts) — that process-level infra is not ported. Instead, these call sites
 *   now write a real row into notifications/'s telegram outbox (telegram_outbox_events), so
 *   the event is persisted and awaiting a worker rather than only logged (Fase 8).
 * - applyUserBalanceDelta / mining runtime: skipped (engine hook deferred).
 * - player-dossier: ported in support.dossier.service.ts (getSupportTicketPlayerDossier),
 *   minus the accountCollisions cross-reference (adminAccountCollisionService not ported).
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { SupportNotFoundError } from "./support.errors.js";
import {
  parseSupportPayload,
  serializeSupportPayload,
  toPublicSupportReply,
  type PublicSupportReply,
} from "./support.payload.js";
import { emitSupportReply, emitUserNotification } from "./support.realtime.js";
import { enrichTicket, type TicketRow } from "./support.schemas.js";
import * as supportRepo from "./support.repository.js";
import {
  TELEGRAM_EVENT_TYPES,
  createGenericTelegramOutboxEvent,
  createNotification,
  notifyNewSupportTicket,
  notifySupportReply,
} from "../notifications/index.js";

const log = logger.child("support.service");

export type CreateMessageInput = {
  userId: number | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  attachments?: Array<{ url: string; mimeType?: string }>;
};

export async function createMessageForUser(input: CreateMessageInput): Promise<{ id: number }> {
  const stored = serializeSupportPayload(input.message, input.attachments ?? []);
  const newMessage = await supportRepo.createSupportMessage({
    userId: input.userId,
    name: input.name,
    email: input.email,
    subject: input.subject,
    message: stored,
  });

  void createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.SUPPORT_TICKET_NEW,
    { ticketId: newMessage.id, userId: input.userId, subject: input.subject, guestEmail: input.email },
    { userId: input.userId, usernameSnapshot: input.name || input.email || null },
  ).catch((err) => log.warn("telegram outbox write failed (support ticket)", { error: String(err) }));

  // Parallel, independent mechanism (mirrors legacy): immediate fan-out to the dedicated
  // support-subscription bot, in addition to (not instead of) the outbox write above. Honest
  // no-op if SUPPORT_TELEGRAM_BOT_TOKEN is not configured.
  void (async () => {
    try {
      const username = input.userId ? await supportRepo.findUsername(input.userId) : null;
      notifyNewSupportTicket({
        id: newMessage.id,
        name: input.name,
        email: input.email,
        subject: input.subject,
        body: input.message,
        userId: input.userId,
        username,
      });
    } catch (err) {
      log.warn("support-subscription telegram notify failed", { error: String(err) });
    }
  })();

  return { id: newMessage.id };
}

export async function listMessagesForUser(userId: number, skip: number, limit: number) {
  const [messages, total] = await Promise.all([
    supportRepo.listUserSupportMessages(userId, skip, limit),
    supportRepo.countUserSupportMessages(userId),
  ]);
  return { messages, total };
}

export async function getMessageForUser(userId: number, id: number) {
  const row = await supportRepo.findSupportMessageWithReplies(id);
  if (!row || row.userId !== userId) return null;
  return enrichTicket(row as TicketRow);
}

export async function addUserReply(params: {
  supportMessageId: number;
  userId: number;
  body: string;
  attachments?: Array<{ url: string; mimeType?: string }>;
}) {
  const { supportMessageId, userId, body, attachments = [] } = params;
  const ticket = await supportRepo.findSupportMessageOwner(supportMessageId);
  if (!ticket || ticket.userId !== userId) throw new SupportNotFoundError();

  const stored = serializeSupportPayload(body, attachments);
  const newReply = await supportRepo.createSupportReply({
    supportMessageId,
    senderId: userId,
    message: stored,
    isAdmin: false,
  });
  // Admin already replied → green. User follow-up must flip back to amber / unread so
  // the ticket resurfaces at the top of the admin queue.
  await supportRepo.markSupportMessageAwaitingReply(supportMessageId);
  emitSupportReply(supportMessageId, newReply);

  void createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.SUPPORT_REPLY_NEW,
    { ticketId: supportMessageId, userId },
    { userId },
  ).catch((err) => log.warn("telegram outbox write failed (support reply)", { error: String(err) }));

  // Parallel, independent mechanism (mirrors legacy): immediate fan-out to the dedicated
  // support-subscription bot, in addition to the outbox write above.
  void (async () => {
    try {
      const [subject, username] = await Promise.all([
        supportRepo.findSupportMessageSubject(supportMessageId),
        supportRepo.findUsername(userId),
      ]);
      notifySupportReply({
        ticketId: supportMessageId,
        subject,
        username,
        userId,
        message: body,
      });
    } catch (err) {
      log.warn("support-subscription telegram reply notify failed", { error: String(err) });
    }
  })();

  return toPublicSupportReply(newReply);
}

export async function listMessagesForAdmin(
  userIdFilter: number | null,
  skip: number,
  limit: number,
  archivedFilter: boolean = false,
) {
  const where = { archived: archivedFilter, ...(userIdFilter != null ? { userId: userIdFilter } : {}) };
  const [rows, total] = await Promise.all([
    supportRepo.listAdminSupportMessages(where, skip, limit),
    supportRepo.countAdminSupportMessages(where),
  ]);
  // List rows only need the preview text decoded (not full attachment payloads like the
  // single-ticket enrichTicket() does) — without this, the ticket list showed the raw
  // "__BM_SPT1__\n{...}" envelope as the preview snippet whenever a ticket had an image
  // attached (PROGRESSO.txt item 51).
  const messages = rows.map((row) => {
    const { body } = parseSupportPayload(row.message);
    return { ...row, message: body };
  });
  return { messages, total };
}

export async function setTicketArchivedForAdmin(id: number, archived: boolean): Promise<boolean> {
  const ticket = await supportRepo.findSupportMessageOwner(id);
  if (!ticket) return false;
  await supportRepo.setSupportMessageArchived(id, archived);
  return true;
}

export async function getMessageForAdmin(id: number) {
  const row = await supportRepo.findAdminSupportMessageWithReplies(id);
  if (!row) return null;
  if (!row.isRead) {
    await supportRepo.markSupportMessageRead(id);
  }
  return enrichTicket(row as TicketRow);
}

export type CreditPolOutcome =
  | { ok: false; reason: "ticket_not_found" | "no_linked_account" }
  | { ok: true; polBalance: number | null; transactionId: number; reply: PublicSupportReply | null };

export async function creditPolForAdminTicket(
  ticketId: number,
  amount: number,
  reason: string,
  ip: string | null,
): Promise<CreditPolOutcome> {
  const ticket = await supportRepo.findSupportMessageForCredit(ticketId);
  if (!ticket) return { ok: false, reason: "ticket_not_found" };
  if (!ticket.userId) return { ok: false, reason: "no_linked_account" };

  const userId = ticket.userId;

  const result = await prisma.$transaction(async (tx) => {
    const user = await supportRepo.findUserByIdTx(tx, userId);
    if (!user) throw Object.assign(new Error("User not found"), { code: "USER_NOT_FOUND" });

    const updated = await supportRepo.incrementUserBalanceTx(tx, userId, amount);
    const transaction = await supportRepo.createAdminCreditTransactionTx(tx, userId, amount);
    await supportRepo.createSupportCreditAuditLogTx(tx, {
      userId,
      ticketId: ticket.id,
      reason,
      amount,
      transactionId: transaction.id,
      ip,
    });

    return { polBalance: updated.polBalance, transactionId: transaction.id };
  });

  const polBalance = result.polBalance == null ? null : Number(result.polBalance);

  try {
    const noteBody = `[Admin] Foram creditados ${amount.toFixed(6)} POL na sua conta. Motivo: ${reason}`;
    const reply = await addAdminReply({ supportMessageId: ticket.id, body: noteBody });
    return { ok: true, polBalance, transactionId: result.transactionId, reply };
  } catch (replyErr) {
    log.error("Could not append credit note to ticket", { error: String(replyErr) });
    return { ok: true, polBalance, transactionId: result.transactionId, reply: null };
  }
}

export async function addAdminReply(params: {
  supportMessageId: number;
  body: string;
  attachments?: Array<{ url: string; mimeType?: string }>;
}) {
  const { supportMessageId, body, attachments = [] } = params;
  const ticket = await supportRepo.findSupportMessageOwner(supportMessageId);
  if (!ticket) throw new SupportNotFoundError();

  const stored = serializeSupportPayload(body, attachments);
  const reply = await supportRepo.createSupportReply({
    supportMessageId,
    message: stored,
    isAdmin: true,
    senderId: null,
  });
  await supportRepo.markSupportMessageReplied(supportMessageId);
  emitSupportReply(supportMessageId, reply);

  // Pop-up + notification bell for the ticket owner — see support.realtime.ts
  // emitUserNotification() doc comment (item 52).
  if (ticket.userId) {
    const subject = await supportRepo.findSupportMessageSubject(supportMessageId);
    const notification = await createNotification({
      userId: ticket.userId,
      title: "Suporte respondeu seu ticket",
      message: subject ? `"${subject}" tem uma nova resposta.` : "Seu ticket de suporte tem uma nova resposta.",
      type: "info",
    });
    if (notification) emitUserNotification(ticket.userId, notification);
  }

  return toPublicSupportReply(reply);
}

// ─── Public support ───────────────────────────────────────────────────────────

export async function createPublicTicket(data: {
  guestName: string;
  guestEmail: string;
  subject: string;
  message: string;
  imageUrl: string | null;
}) {
  const ticket = await supportRepo.createTicketWithGuestMessage(data);
  void createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.PUBLIC_SUPPORT_TICKET_NEW,
    { ticketId: ticket.id, guestEmail: data.guestEmail, guestName: data.guestName, subject: data.subject },
    { usernameSnapshot: data.guestName || data.guestEmail || null },
  ).catch((err) => log.warn("telegram outbox write failed (public support ticket)", { error: String(err) }));
  return ticket;
}

export async function listPublicTicketsByEmail(email: string) {
  return supportRepo.listTicketsByEmail(email);
}

export async function getPublicTicket(id: number, email: string) {
  return supportRepo.findTicketByIdAndEmailWithMessages(id, email);
}

export async function addPublicGuestMessage(
  id: number,
  email: string,
  content: string,
  imageUrl: string | null,
) {
  const ticket = await supportRepo.findTicketByIdAndEmailBasic(id, email);
  if (!ticket) return { ok: false as const, reason: "not_found" as const };
  if (ticket.status === "closed") return { ok: false as const, reason: "ticket_closed" as const };

  const msg = await supportRepo.createGuestMessage(id, content || "", imageUrl);
  await supportRepo.touchTicketOpen(id);
  void createGenericTelegramOutboxEvent(
    TELEGRAM_EVENT_TYPES.PUBLIC_GUEST_MESSAGE_NEW,
    { ticketId: id, guestEmail: email },
    { usernameSnapshot: email },
  ).catch((err) => log.warn("telegram outbox write failed (public guest message)", { error: String(err) }));
  return { ok: true as const, message: msg };
}

export async function adminListPublicTickets(status: string | undefined, page: number, limit: number) {
  const where = status && status !== "all" ? { status } : {};
  const [total, tickets] = await Promise.all([
    supportRepo.countTicketsByStatus(where),
    supportRepo.listTicketsPaged(where, (page - 1) * limit, limit),
  ]);
  return { tickets, total, page, limit };
}

export async function adminGetPublicTicket(id: number) {
  return supportRepo.findTicketByIdWithMessages(id);
}

export async function adminReplyPublicTicket(id: number, content: string, imageUrl: string | null) {
  const ticket = await supportRepo.findTicketByIdBasic(id);
  if (!ticket) return null;
  const msg = await supportRepo.createAdminMessage(id, content || "", imageUrl);
  await supportRepo.touchTicketUpdatedAt(id);
  return msg;
}

export async function adminSetPublicTicketStatus(id: number, status: string) {
  await supportRepo.setTicketStatus(id, status);
}
