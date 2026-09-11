import type { Request, Response } from "express";
import { readErrorCode, requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { createCategoryUpload, uploadedFileUrl } from "../media/index.js";
import { SUPPORT_ERROR } from "./support.errors.js";
import { createMessageSchema, parseSupportPagination, replySchema } from "./support.schemas.js";
import * as supportService from "./support.service.js";

const log = logger.child("support.controller");

const supportImageUpload = createCategoryUpload("support");

export async function createMessage(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }
    const { name, email, subject, message, attachments } = parsed.data;
    const userId = req.user?.id ?? null;
    const created = await supportService.createMessageForUser({ userId, name, email, subject, message, attachments });
    res.status(201).json({ ok: true, message: "Created", id: created.id });
  } catch (e: unknown) {
    log.error("Error creating message", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error sending support message" });
  }
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { limit, page, skip } = parseSupportPagination(req, { defaultLimit: 20, maxLimit: 50 });
    const { messages, total } = await supportService.listMessagesForUser(user.id, skip, limit);
    res.json({ ok: true, messages, page, limit, total });
  } catch (e: unknown) {
    log.error("Error listing messages", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
}

export async function getMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const id = parseInt(String(req.params.id), 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }
    const message = await supportService.getMessageForUser(user.id, id);
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

/** Authenticated ticket-attachment upload — field "image", media category "support". */
export async function uploadSupportImage(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  supportImageUpload.single("image")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "Upload inválido." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, message: "No file uploaded" });
      return;
    }
    const url = uploadedFileUrl("support", req.file.filename);
    const mimeType = req.file.filename.endsWith(".webp") ? "image/webp" : req.file.mimetype || null;
    res.json({ ok: true, url, mimeType });
  });
}

export async function replyToMessage(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const id = parseInt(String(req.params.id), 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }
    try {
      const reply = await supportService.addUserReply({
        supportMessageId: id,
        userId: user.id,
        body: parsed.data.message,
        attachments: parsed.data.attachments,
      });
      res.status(201).json({ ok: true, reply });
    } catch (inner: unknown) {
      if (readErrorCode(inner) === SUPPORT_ERROR.NOT_FOUND || (inner instanceof Error && inner.message === "NOT_FOUND")) {
        res.status(404).json({ ok: false, message: "Support ticket not found" });
        return;
      }
      throw inner;
    }
  } catch (e: unknown) {
    log.error("Error replying to message", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
}
