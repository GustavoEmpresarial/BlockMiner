import type { Request, Response } from "express";
import { getClientIp } from "../../shared/http/clientIp.js";
import { readErrorCode } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { SUPPORT_ERROR } from "./support.errors.js";
import {
  adminReplySchema,
  creditPolSchema,
  parseSupportPagination,
  sanitizeImageUrl,
  sanitizeStr,
} from "./support.schemas.js";
import {
  publicSupportIdParamSchema,
  adminPublicSupportQuerySchema,
  adminReplyPublicTicketSchema,
  adminSetPublicTicketStatusSchema,
} from "./public-support.schemas.js";
import * as supportService from "./support.service.js";
import { getSupportTicketPlayerDossier } from "./support.dossier.service.js";
import { logAdminAction } from "../admin/index.js";

const log = logger.child("support.admin.controller");

export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const { limit, page, skip } = parseSupportPagination(req, { defaultLimit: 50, maxLimit: 100 });
    const userIdFilter = req.query.userId ? parseInt(String(req.query.userId), 10) : null;
    const validUserIdFilter = userIdFilter != null && !Number.isNaN(userIdFilter) ? userIdFilter : null;
    const archivedFilter = String(req.query.archived ?? "").trim() === "1";
    const { messages, total } = await supportService.listMessagesForAdmin(validUserIdFilter, skip, limit, archivedFilter);
    res.json({ ok: true, messages, page, limit, total });
  } catch (e: unknown) {
    log.error("Error listing messages", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
}

export async function setArchived(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }
    const archived = Boolean((req.body as { archived?: unknown } | undefined)?.archived);
    const ok = await supportService.setTicketArchivedForAdmin(id, archived);
    if (!ok) {
      res.status(404).json({ ok: false, message: "Message not found" });
      return;
    }
    res.json({ ok: true, archived });
  } catch (e: unknown) {
    log.error("Error archiving message", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error archiving message" });
  }
}

export async function getMessage(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }
    const message = await supportService.getMessageForAdmin(id);
    if (!message) {
      res.status(404).json({ ok: false, message: "Message not found" });
      return;
    }
    res.json({ ok: true, message });
  } catch (e: unknown) {
    log.error("Error getting message", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
}

export async function getPlayerDossier(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  try {
    const result = await getSupportTicketPlayerDossier(id, req.query as Record<string, string | undefined>);
    if (!result.ok) {
      res.status(404).json({ ok: false, message: "Ticket not found" });
      return;
    }
    res.json(result);
  } catch (e: unknown) {
    log.error("Error building player dossier", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error building player dossier" });
  }
}

export async function creditPol(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }
    const parsed = creditPolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }
    const amount = parsed.data.amount;
    const reason = parsed.data.reason;
    const ip = getClientIp(req) ?? null;

    const outcome = await supportService.creditPolForAdminTicket(id, amount, reason, ip);
    if (!outcome.ok) {
      if (outcome.reason === "ticket_not_found") {
        res.status(404).json({ ok: false, message: "Ticket not found" });
        return;
      }
      res.status(400).json({ ok: false, message: "Ticket is not linked to a player account" });
      return;
    }

    res.json({
      ok: true,
      message: "POL credited",
      amount,
      polBalance: outcome.polBalance,
      transactionId: outcome.transactionId,
      ...(outcome.reply ? { reply: outcome.reply } : {}),
    });
  } catch (e: unknown) {
    log.error("Error crediting POL", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error crediting POL" });
  }
}

export async function replyToMessage(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }
    const parsed = adminReplySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }
    const text = parsed.data.reply ?? parsed.data.message;
    if (!text) {
      res.status(400).json({ ok: false, message: "Reply content is required" });
      return;
    }
    try {
      const reply = await supportService.addAdminReply({
        supportMessageId: id,
        body: text,
        attachments: parsed.data.attachments,
      });
      res.json({ ok: true, message: "Reply saved successfully", reply });
    } catch (inner: unknown) {
      if (readErrorCode(inner) === SUPPORT_ERROR.NOT_FOUND || (inner instanceof Error && inner.message === "NOT_FOUND")) {
        res.status(404).json({ ok: false, message: "Message not found" });
        return;
      }
      throw inner;
    }
  } catch (e: unknown) {
    log.error("Error replying to message", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
}

// ─── Public support admin ─────────────────────────────────────────────────────

export async function adminListPublicTickets(req: Request, res: Response): Promise<void> {
  const parsed = adminPublicSupportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, code: "validation_error", errors: parsed.error.issues });
    return;
  }
  const { status, page, limit } = parsed.data;
  const statusFilter = status === "all" ? undefined : status;
  const result = await supportService.adminListPublicTickets(statusFilter, page, limit);
  res.json({ ok: true, ...result });
}

export async function adminGetPublicTicket(req: Request, res: Response): Promise<void> {
  const paramParsed = publicSupportIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
    return;
  }
  const { id } = paramParsed.data;
  const ticket = await supportService.adminGetPublicTicket(id);
  if (!ticket) {
    res.status(404).json({ ok: false, message: "not_found", code: "not_found" });
    return;
  }
  res.json({ ok: true, ticket });
}

export async function adminReplyPublicTicket(req: Request, res: Response): Promise<void> {
  const paramParsed = publicSupportIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
    return;
  }
  const { id } = paramParsed.data;

  const bodyParsed = adminReplyPublicTicketSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
    return;
  }

  const content = bodyParsed.data.message ?? "";
  const imageUrl = sanitizeImageUrl(bodyParsed.data.imageUrl);

  const msg = await supportService.adminReplyPublicTicket(id, content, imageUrl);
  if (!msg) {
    res.status(404).json({ ok: false, message: "not_found", code: "not_found" });
    return;
  }

  void logAdminAction({
    adminId: req.admin?.adminId ?? null,
    adminEmail: req.admin?.email ?? null,
    sessionId: req.admin?.sessionId ?? null,
    action: "ADMIN_REPLY_PUBLIC_SUPPORT_TICKET",
    module: "support",
    resource: "PublicSupportTicket",
    resourceId: String(id),
  });

  res.status(201).json({ ok: true, message: msg });
}

export async function adminSetPublicTicketStatus(req: Request, res: Response): Promise<void> {
  const paramParsed = publicSupportIdParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    res.status(400).json({ ok: false, code: "invalid_id", errors: paramParsed.error.issues });
    return;
  }
  const { id } = paramParsed.data;

  const bodyParsed = adminSetPublicTicketStatusSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ ok: false, code: "validation_error", errors: bodyParsed.error.issues });
    return;
  }
  const { status } = bodyParsed.data;

  const updated = await supportService.adminSetPublicTicketStatus(id, status);
  if (!updated) {
    res.status(404).json({ ok: false, message: "not_found", code: "not_found" });
    return;
  }

  void logAdminAction({
    adminId: req.admin?.adminId ?? null,
    adminEmail: req.admin?.email ?? null,
    sessionId: req.admin?.sessionId ?? null,
    action: "ADMIN_SET_PUBLIC_SUPPORT_STATUS",
    module: "support",
    resource: "PublicSupportTicket",
    resourceId: String(id),
    newValue: { status },
  });

  res.json({ ok: true });
}
