import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function createSupportMessage(
  data: Prisma.SupportMessageCreateInput | Prisma.SupportMessageUncheckedCreateInput
) {
  return prisma.supportMessage.create({ data: data as Prisma.SupportMessageCreateInput });
}

export async function findUsername(userId: number): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  return u?.username ?? null;
}

export async function listUserSupportMessages(userId: number, skip: number, limit: number) {
  return prisma.supportMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
    select: {
      id: true,
      subject: true,
      isRead: true,
      isReplied: true,
      createdAt: true,
    },
  });
}

export async function countUserSupportMessages(userId: number): Promise<number> {
  return prisma.supportMessage.count({ where: { userId } });
}

export async function findSupportMessageWithReplies(id: number) {
  return prisma.supportMessage.findUnique({
    where: { id },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
}

export async function listAdminSupportMessages(
  where: Prisma.SupportMessageWhereInput,
  skip: number,
  limit: number
) {
  return prisma.supportMessage.findMany({
    where,
    orderBy: [{ isReplied: "asc" }, { createdAt: "desc" }],
    skip,
    take: limit,
    include: {
      user: { select: { username: true, email: true } },
    },
  });
}

export async function countAdminSupportMessages(where: Prisma.SupportMessageWhereInput): Promise<number> {
  return prisma.supportMessage.count({ where });
}

export async function setSupportMessageArchived(id: number, archived: boolean): Promise<void> {
  await prisma.supportMessage.update({
    where: { id },
    data: { archived, archivedAt: archived ? new Date() : null },
  });
}

export async function findAdminSupportMessageWithReplies(id: number) {
  return prisma.supportMessage.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, email: true } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function markSupportMessageRead(id: number): Promise<void> {
  await prisma.supportMessage.update({ where: { id }, data: { isRead: true } });
}

export async function findSupportMessageForCredit(id: number) {
  return prisma.supportMessage.findUnique({
    where: { id },
    select: { id: true, userId: true, email: true, name: true },
  });
}

export async function findSupportMessageOwner(supportMessageId: number) {
  return prisma.supportMessage.findUnique({
    where: { id: supportMessageId },
    select: { id: true, userId: true },
  });
}

export async function findSupportMessageSubject(supportMessageId: number): Promise<string | null> {
  const row = await prisma.supportMessage.findUnique({
    where: { id: supportMessageId },
    select: { subject: true },
  });
  return row?.subject ?? null;
}

export async function createSupportReply(
  data: Prisma.SupportReplyCreateInput | Prisma.SupportReplyUncheckedCreateInput
) {
  return prisma.supportReply.create({ data: data as Prisma.SupportReplyCreateInput });
}

export async function markSupportMessageAwaitingReply(id: number): Promise<void> {
  await prisma.supportMessage.update({
    where: { id },
    data: {
      isReplied: false,
      isRead: false,
      repliedAt: null,
      archived: false,
      archivedAt: null,
    },
  });
}

export async function markSupportMessageReplied(id: number): Promise<void> {
  await prisma.supportMessage.update({
    where: { id },
    data: { isReplied: true, repliedAt: new Date() },
  });
}

export async function deleteSupportMessagesOlderThan(cutoff: Date, batchSize: number): Promise<number> {
  const candidates = await prisma.supportMessage.findMany({
    where: { createdAt: { lt: cutoff } },
    select: {
      id: true,
      createdAt: true,
      replies: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
    take: batchSize * 4,
    orderBy: { createdAt: "asc" },
  });
  const doomedIds = candidates
    .filter((row) => {
      const lastReply = row.replies[0]?.createdAt;
      const lastActivity = lastReply && lastReply > row.createdAt ? lastReply : row.createdAt;
      return lastActivity < cutoff;
    })
    .slice(0, batchSize)
    .map((row) => row.id);
  if (doomedIds.length === 0) return 0;
  const res = await prisma.supportMessage.deleteMany({ where: { id: { in: doomedIds } } });
  return res.count;
}

export async function deletePublicSupportTicketsOlderThan(cutoff: Date, batchSize: number): Promise<number> {
  const doomed = await prisma.publicSupportTicket.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { id: true },
    take: batchSize,
    orderBy: { updatedAt: "asc" },
  });
  if (doomed.length === 0) return 0;
  const res = await prisma.publicSupportTicket.deleteMany({
    where: { id: { in: doomed.map((t) => t.id) } },
  });
  return res.count;
}

export type SupportTxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function findUserByIdTx(tx: SupportTxClient, userId: number) {
  return tx.user.findUnique({ where: { id: userId }, select: { id: true } });
}

export async function incrementUserBalanceTx(
  tx: SupportTxClient,
  userId: number,
  amount: number
) {
  return tx.user.update({
    where: { id: userId },
    data: { polBalance: { increment: amount } },
    select: { polBalance: true },
  });
}

export async function createAdminCreditTransactionTx(
  tx: SupportTxClient,
  userId: number,
  amount: number
) {
  return tx.transaction.create({
    data: {
      userId,
      type: "admin_credit",
      amount,
      status: "completed",
      completedAt: new Date(),
    },
    select: { id: true },
  });
}

export async function createSupportCreditAuditLogTx(
  tx: SupportTxClient,
  data: {
    userId: number;
    ticketId: number;
    amount: number;
    reason: string;
    transactionId: number;
    ip?: string | null;
  }
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: data.userId,
      action: "ADMIN_SUPPORT_CREDIT_POL",
      label: "Support POL credit",
      description: `Support ticket #${data.ticketId}: ${data.reason}`,
      source: "admin",
      severity: "warn",
      ip: data.ip,
      detailsJson: JSON.stringify({
        supportMessageId: data.ticketId,
        amount: data.amount,
        reason: data.reason,
        transactionId: data.transactionId,
      }),
      relatedEntityType: "support_message",
      relatedEntityId: String(data.ticketId),
    },
  });
}

// ─── Public support (guest tickets) ───────────────────────────────────────────

export interface CreatePublicTicketData {
  guestName: string;
  guestEmail: string;
  subject: string;
  message: string;
  imageUrl?: string | null;
}

export async function createTicketWithGuestMessage(data: CreatePublicTicketData) {
  return prisma.publicSupportTicket.create({
    data: {
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      subject: data.subject,
      messages: { create: { authorType: "guest", content: data.message, imageUrl: data.imageUrl } },
    },
    include: { messages: true },
  });
}

export async function listTicketsByEmail(email: string) {
  return prisma.publicSupportTicket.findMany({
    where: { guestEmail: email },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorType: true, content: true, createdAt: true },
      },
    },
    take: 50,
  });
}

export async function findTicketByIdAndEmailWithMessages(id: number, email: string) {
  return prisma.publicSupportTicket.findFirst({
    where: { id, guestEmail: email },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function findTicketByIdAndEmailBasic(id: number, email: string) {
  return prisma.publicSupportTicket.findFirst({
    where: { id, guestEmail: email },
    select: { id: true, status: true },
  });
}

export async function createGuestMessage(ticketId: number, content: string, imageUrl?: string | null) {
  return prisma.publicSupportMessage.create({
    data: { ticketId, authorType: "guest", content, imageUrl },
  });
}

export async function touchTicketOpen(id: number): Promise<void> {
  await prisma.publicSupportTicket.update({
    where: { id },
    data: { updatedAt: new Date(), status: "open" },
  });
}

export async function countTicketsByStatus(where: Prisma.PublicSupportTicketWhereInput): Promise<number> {
  return prisma.publicSupportTicket.count({ where });
}

export async function listTicketsPaged(
  where: Prisma.PublicSupportTicketWhereInput,
  skip: number,
  take: number
) {
  return prisma.publicSupportTicket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip,
    take,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorType: true, content: true, createdAt: true },
      },
    },
  });
}

export async function findTicketByIdWithMessages(id: number) {
  return prisma.publicSupportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function findTicketByIdBasic(id: number) {
  return prisma.publicSupportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
}

export async function createAdminMessage(ticketId: number, content: string, imageUrl?: string | null) {
  return prisma.publicSupportMessage.create({
    data: { ticketId, authorType: "admin", content, imageUrl },
  });
}

export async function touchTicketUpdatedAt(id: number): Promise<void> {
  await prisma.publicSupportTicket.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
}

export async function setTicketStatus(id: number, status: string): Promise<boolean> {
  try {
    await prisma.publicSupportTicket.update({ where: { id }, data: { status } });
    return true;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2025") {
      return false;
    }
    throw error;
  }
}
