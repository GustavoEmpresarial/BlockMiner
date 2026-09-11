// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
export async function createSupportMessage(data) {
    return prisma.supportMessage.create({ data });
}
export async function findUsername(userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    return u?.username ?? null;
}
export async function listUserSupportMessages(userId, skip, limit) {
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
export async function countUserSupportMessages(userId) {
    return prisma.supportMessage.count({ where: { userId } });
}
export async function findSupportMessageWithReplies(id) {
    return prisma.supportMessage.findUnique({
        where: { id },
        include: { replies: { orderBy: { createdAt: "asc" } } },
    });
}
export async function listAdminSupportMessages(where, skip, limit) {
    return prisma.supportMessage.findMany({
        where,
        // Tickets still awaiting a reply float to the top (within the same archived/not-archived
        // bucket) — that's what actually needs the admin's attention. Already-replied tickets sort
        // after, newest first. (First shipped as replied-first per literal request, but that buried
        // brand-new unanswered tickets behind old resolved ones — flipped same day, PROGRESSO.txt
        // item 53b.)
        orderBy: [{ isReplied: "asc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
            user: { select: { username: true, email: true } },
        },
    });
}
export async function countAdminSupportMessages(where) {
    return prisma.supportMessage.count({ where });
}
export async function setSupportMessageArchived(id, archived) {
    await prisma.supportMessage.update({
        where: { id },
        data: { archived, archivedAt: archived ? new Date() : null },
    });
}
export async function findAdminSupportMessageWithReplies(id) {
    return prisma.supportMessage.findUnique({
        where: { id },
        include: {
            user: { select: { username: true, email: true } },
            replies: { orderBy: { createdAt: "asc" } },
        },
    });
}
export async function markSupportMessageRead(id) {
    await prisma.supportMessage.update({ where: { id }, data: { isRead: true } });
}
export async function findSupportMessageForCredit(id) {
    return prisma.supportMessage.findUnique({
        where: { id },
        select: { id: true, userId: true, email: true, name: true },
    });
}
export async function findSupportMessageOwner(supportMessageId) {
    return prisma.supportMessage.findUnique({
        where: { id: supportMessageId },
        select: { id: true, userId: true },
    });
}
export async function findSupportMessageSubject(supportMessageId) {
    const row = await prisma.supportMessage.findUnique({
        where: { id: supportMessageId },
        select: { subject: true },
    });
    return row?.subject ?? null;
}
export async function createSupportReply(data) {
    return prisma.supportReply.create({ data });
}
/** User follow-up after admin replied — ticket goes back to amber / awaiting attention. */
export async function markSupportMessageAwaitingReply(id) {
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
export async function markSupportMessageReplied(id) {
    await prisma.supportMessage.update({
        where: { id },
        data: { isReplied: true, repliedAt: new Date() },
    });
}
/** Hard-delete support tickets older than `cutoff` (by last activity). Cascades replies. */
export async function deleteSupportMessagesOlderThan(cutoff, batchSize) {
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
    if (doomedIds.length === 0)
        return 0;
    const res = await prisma.supportMessage.deleteMany({ where: { id: { in: doomedIds } } });
    return res.count;
}
/** Hard-delete public (guest) tickets older than `cutoff` (by updatedAt). Cascades messages. */
export async function deletePublicSupportTicketsOlderThan(cutoff, batchSize) {
    const doomed = await prisma.publicSupportTicket.findMany({
        where: { updatedAt: { lt: cutoff } },
        select: { id: true },
        take: batchSize,
        orderBy: { updatedAt: "asc" },
    });
    if (doomed.length === 0)
        return 0;
    const res = await prisma.publicSupportTicket.deleteMany({
        where: { id: { in: doomed.map((t) => t.id) } },
    });
    return res.count;
}
export async function findUserByIdTx(tx, userId) {
    return tx.user.findUnique({ where: { id: userId }, select: { id: true } });
}
export async function incrementUserBalanceTx(tx, userId, amount) {
    return tx.user.update({
        where: { id: userId },
        data: { polBalance: { increment: amount } },
        select: { polBalance: true },
    });
}
export async function createAdminCreditTransactionTx(tx, userId, amount) {
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
export async function createSupportCreditAuditLogTx(tx, data) {
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
export async function createTicketWithGuestMessage(data) {
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
export async function listTicketsByEmail(email) {
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
export async function findTicketByIdAndEmailWithMessages(id, email) {
    return prisma.publicSupportTicket.findFirst({
        where: { id, guestEmail: email },
        include: { messages: { orderBy: { createdAt: "asc" } } },
    });
}
export async function findTicketByIdAndEmailBasic(id, email) {
    return prisma.publicSupportTicket.findFirst({
        where: { id, guestEmail: email },
        select: { id: true, status: true },
    });
}
export async function createGuestMessage(ticketId, content, imageUrl) {
    return prisma.publicSupportMessage.create({
        data: { ticketId, authorType: "guest", content, imageUrl },
    });
}
export async function touchTicketOpen(id) {
    await prisma.publicSupportTicket.update({
        where: { id },
        data: { updatedAt: new Date(), status: "open" },
    });
}
export async function countTicketsByStatus(where) {
    return prisma.publicSupportTicket.count({ where });
}
export async function listTicketsPaged(where, skip, take) {
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
export async function findTicketByIdWithMessages(id) {
    return prisma.publicSupportTicket.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
    });
}
export async function findTicketByIdBasic(id) {
    return prisma.publicSupportTicket.findUnique({ where: { id }, select: { id: true } });
}
export async function createAdminMessage(ticketId, content, imageUrl) {
    return prisma.publicSupportMessage.create({
        data: { ticketId, authorType: "admin", content, imageUrl },
    });
}
export async function touchTicketUpdatedAt(id) {
    await prisma.publicSupportTicket.update({
        where: { id },
        data: { updatedAt: new Date() },
    });
}
export async function setTicketStatus(id, status) {
    await prisma.publicSupportTicket.update({ where: { id }, data: { status } });
}
