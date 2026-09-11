import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { createCategoryUpload, uploadedFileUrl } from "../media/index.js";
import {
  isValidEmail,
  PS_MAX_MSG_LEN,
  PS_MAX_NAME_LEN,
  PS_MAX_SUBJECT_LEN,
  sanitizeImageUrl,
  sanitizeStr,
} from "./support.schemas.js";
import * as supportService from "./support.service.js";

const log = logger.child("support.public.controller");

const publicSupportImageUpload = createCategoryUpload("support", { prefix: "pub" });

/** Guest ticket-attachment upload (no auth — rate-limited at the route) — field "image", media category "support". */
export async function uploadPublicImage(req: Request, res: Response): Promise<void> {
  publicSupportImageUpload.single("image")(req, res, (err: unknown) => {
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

export async function createTicket(req: Request, res: Response): Promise<void> {
  const name = sanitizeStr(req.body?.name, PS_MAX_NAME_LEN);
  const email = sanitizeStr(req.body?.email, 200).toLowerCase();
  const subject = sanitizeStr(req.body?.subject, PS_MAX_SUBJECT_LEN);
  const message = sanitizeStr(req.body?.message, PS_MAX_MSG_LEN);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);

  if (!name || !email || !subject || !message) {
    res.status(400).json({ ok: false, message: "missing_fields", code: "missing_fields" });
    return;
  }
  if (!isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "invalid_email", code: "invalid_email" });
    return;
  }

  try {
    const ticket = await supportService.createPublicTicket({
      guestName: name,
      guestEmail: email,
      subject,
      message,
      imageUrl,
    });
    res.status(201).json({ ok: true, ticket });
  } catch (e: unknown) {
    log.error("createTicket failed", { error: String(e instanceof Error ? e.message : e) });
    res.status(500).json({ ok: false, message: "Error creating ticket" });
  }
}

export async function listTicketsByEmail(req: Request, res: Response): Promise<void> {
  const email = sanitizeStr(req.query?.email, 200).toLowerCase();
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "invalid_email", code: "invalid_email" });
    return;
  }
  const tickets = await supportService.listPublicTicketsByEmail(email);
  res.json({ ok: true, tickets });
}

export async function getTicket(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const email = sanitizeStr(req.query?.email, 200).toLowerCase();

  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: "invalid_id", code: "invalid_id" });
    return;
  }
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "invalid_email", code: "invalid_email" });
    return;
  }

  const ticket = await supportService.getPublicTicket(id, email);
  if (!ticket) {
    res.status(404).json({ ok: false, message: "not_found", code: "not_found" });
    return;
  }
  res.json({ ok: true, ticket });
}

export async function addGuestMessage(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id), 10);
  const email = sanitizeStr(req.body?.email, 200).toLowerCase();
  const content = sanitizeStr(req.body?.message, PS_MAX_MSG_LEN);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);

  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: "invalid_id", code: "invalid_id" });
    return;
  }
  if (!email || !isValidEmail(email)) {
    res.status(400).json({ ok: false, message: "invalid_email", code: "invalid_email" });
    return;
  }
  if (!content && !imageUrl) {
    res.status(400).json({ ok: false, message: "empty_message", code: "empty_message" });
    return;
  }

  const result = await supportService.addPublicGuestMessage(id, email, content, imageUrl);
  if (!result.ok) {
    if (result.reason === "not_found") {
      res.status(404).json({ ok: false, message: "not_found", code: "not_found" });
      return;
    }
    res.status(400).json({ ok: false, message: "ticket_closed", code: "ticket_closed" });
    return;
  }
  res.status(201).json({ ok: true, message: result.message });
}
