/**
 * Broadcast HTTP handlers — user active/dismiss + admin CRUD/upload.
 * Restored to match dist/server/.../broadcast.controller.js.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { createCategoryUpload, uploadedFileUrl } from "../media/index.js";
import * as broadcastService from "./broadcast.service.js";

const log = logger.child("broadcast.controller");
const broadcastImageUpload = createCategoryUpload("broadcast", { prefix: "bc" });

export async function getActiveBroadcast(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const message = await broadcastService.getActiveBroadcastForUser(user.id);
    res.json({ ok: true, message: message || null });
  } catch (err) {
    log.error("broadcast/active error", { error: String(err) });
    res.status(500).json({ ok: false });
  }
}

export async function dismissBroadcast(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId < 1) {
      res.status(400).json({ ok: false, message: "Invalid broadcast id." });
      return;
    }
    await broadcastService.dismissBroadcastForUser(user.id, messageId);
    res.json({ ok: true });
  } catch (err) {
    log.error("broadcast/dismiss error", { error: String(err) });
    res.status(500).json({ ok: false });
  }
}

function clampDismissDelay(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(120, n));
}

function normalizeBroadcastLink(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).trim().slice(0, 1000);
  if (!s) return null;
  if (/^\//.test(s) || /^https?:\/\//i.test(s)) return s;
  return null;
}

function normalizeBroadcastLabel(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim().slice(0, 60);
  return s || null;
}

/** Admin broadcast image upload — field "image", stored under media category "broadcast". */
export function uploadBroadcastImage(req: Request, res: Response): void {
  broadcastImageUpload.single("image")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "Upload inválido." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
      return;
    }
    res.json({ ok: true, url: uploadedFileUrl("broadcast", req.file.filename) });
  });
}

export async function adminListBroadcasts(_req: Request, res: Response): Promise<void> {
  try {
    const messages = await broadcastService.listBroadcastMessages();
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminCreateBroadcast(req: Request, res: Response): Promise<void> {
  try {
    const { title, content, imageUrl, isActive, dismissDelaySeconds, linkUrl, linkLabel, linkNewTab } = req.body;
    if (!title) {
      res.status(400).json({ ok: false, message: "Title required" });
      return;
    }
    if (isActive) await broadcastService.deactivateAllBroadcastMessages();
    const delay = clampDismissDelay(dismissDelaySeconds);
    const link = normalizeBroadcastLink(linkUrl);
    const label = normalizeBroadcastLabel(linkLabel);
    const msg = await broadcastService.createBroadcastMessage({
      title: String(title),
      content: content != null ? String(content) : null,
      imageUrl: imageUrl != null ? String(imageUrl) : null,
      isActive: !!isActive,
      ...(delay !== undefined && { dismissDelaySeconds: delay }),
      linkUrl: link ?? null,
      linkLabel: label ?? null,
      linkNewTab: Boolean(linkNewTab),
    });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminPatchBroadcast(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const { title, content, imageUrl, isActive, dismissDelaySeconds, linkUrl, linkLabel, linkNewTab } = req.body;
    if (isActive) await broadcastService.deactivateOtherBroadcastMessages(id);
    const delay = clampDismissDelay(dismissDelaySeconds);
    const link = normalizeBroadcastLink(linkUrl);
    const label = normalizeBroadcastLabel(linkLabel);
    const msg = await broadcastService.updateBroadcastMessage(id, {
      ...(title !== undefined && { title: String(title) }),
      ...(content !== undefined && { content }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(delay !== undefined && { dismissDelaySeconds: delay }),
      ...(link !== undefined && { linkUrl: link }),
      ...(label !== undefined && { linkLabel: label }),
      ...(linkNewTab !== undefined && { linkNewTab: Boolean(linkNewTab) }),
    });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminDeleteBroadcast(req: Request, res: Response): Promise<void> {
  try {
    await broadcastService.deleteBroadcastMessage(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}
