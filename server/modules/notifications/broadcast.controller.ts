/**
 * Broadcast HTTP handlers — user active/dismiss + admin CRUD/upload/reset.
 */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { createCategoryUpload, uploadedFileUrl } from "../media/index.js";
import { logAdminAction } from "../admin/index.js";
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
    res.status(500).json({ ok: false, message: "Erro ao carregar notificação." });
  }
}

export async function dismissBroadcast(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId < 1) {
      res.status(400).json({ ok: false, message: "ID de broadcast inválido." });
      return;
    }
    await broadcastService.dismissBroadcastForUser(user.id, messageId);
    res.json({ ok: true });
  } catch (err) {
    log.error("broadcast/dismiss error", { error: String(err) });
    res.status(500).json({ ok: false, message: "Erro ao descartar notificação." });
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
  if (/^(javascript|data|vbscript|file):/i.test(s)) return null;
  if (s.startsWith("//")) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^https:\/\/[a-zA-Z0-9\-\.]+(\.[a-zA-Z]{2,}|localhost)/i.test(s)) return s;
  if (/^http:\/\/(localhost|127\.0\.0\.1)/i.test(s)) return s;
  return null;
}

function normalizeBroadcastLabel(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim().slice(0, 60);
  return s || null;
}

function getAdminReqContext(req: Request) {
  const ip = (req.headers["cf-connecting-ip"] as string) || req.ip || "unknown";
  const ua = req.get("user-agent") || "unknown";
  return {
    adminId: req.admin?.adminId ?? null,
    adminEmail: req.admin?.email ?? null,
    sessionId: req.admin?.sessionId ?? undefined,
    ipAddress: ip,
    userAgent: ua,
  };
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
    if (!title || !String(title).trim()) {
      res.status(400).json({ ok: false, message: "Título é obrigatório." });
      return;
    }
    if (isActive) await broadcastService.deactivateAllBroadcastMessages();
    const delay = clampDismissDelay(dismissDelaySeconds);
    const link = normalizeBroadcastLink(linkUrl);
    const label = normalizeBroadcastLabel(linkLabel);
    const sanitizedTitle = String(title).trim().slice(0, 200);
    const sanitizedContent = content != null ? String(content).trim().slice(0, 4000) : null;

    const msg = await broadcastService.createBroadcastMessage({
      title: sanitizedTitle,
      content: sanitizedContent,
      imageUrl: imageUrl != null ? String(imageUrl).trim().slice(0, 1000) : null,
      isActive: Boolean(isActive),
      ...(delay !== undefined && { dismissDelaySeconds: delay }),
      linkUrl: link ?? null,
      linkLabel: label ?? null,
      linkNewTab: Boolean(linkNewTab),
    });

    const ctx = getAdminReqContext(req);
    void logAdminAction({
      ...ctx,
      action: "BROADCAST_CREATE",
      module: "broadcast",
      resource: "BroadcastMessage",
      resourceId: String(msg.id),
      newValue: {
        title: msg.title,
        isActive: msg.isActive,
        dismissDelaySeconds: msg.dismissDelaySeconds,
        linkUrl: msg.linkUrl,
      },
    });

    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminPatchBroadcast(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "ID inválido." });
      return;
    }
    const { title, content, imageUrl, isActive, dismissDelaySeconds, linkUrl, linkLabel, linkNewTab } = req.body;
    const oldMsg = await broadcastService.findBroadcastMessageById(id);
    if (!oldMsg) {
      res.status(404).json({ ok: false, message: "Mensagem não encontrada." });
      return;
    }

    if (isActive) await broadcastService.deactivateOtherBroadcastMessages(id);
    const delay = clampDismissDelay(dismissDelaySeconds);
    const link = normalizeBroadcastLink(linkUrl);
    const label = normalizeBroadcastLabel(linkLabel);

    const msg = await broadcastService.updateBroadcastMessage(id, {
      ...(title !== undefined && { title: String(title).trim().slice(0, 200) }),
      ...(content !== undefined && { content: content != null ? String(content).trim().slice(0, 4000) : null }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl != null ? String(imageUrl).trim().slice(0, 1000) : null }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      ...(delay !== undefined && { dismissDelaySeconds: delay }),
      ...(link !== undefined && { linkUrl: link }),
      ...(label !== undefined && { linkLabel: label }),
      ...(linkNewTab !== undefined && { linkNewTab: Boolean(linkNewTab) }),
    });

    const ctx = getAdminReqContext(req);
    const isToggleOnly = Object.keys(req.body).length === 1 && req.body.isActive !== undefined;
    void logAdminAction({
      ...ctx,
      action: isToggleOnly ? "BROADCAST_TOGGLE_ACTIVE" : "BROADCAST_UPDATE",
      module: "broadcast",
      resource: "BroadcastMessage",
      resourceId: String(id),
      oldValue: { title: oldMsg.title, isActive: oldMsg.isActive, dismissDelaySeconds: oldMsg.dismissDelaySeconds },
      newValue: { title: msg.title, isActive: msg.isActive, dismissDelaySeconds: msg.dismissDelaySeconds },
    });

    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminResetBroadcastViews(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "ID de broadcast inválido." });
      return;
    }
    const oldMsg = await broadcastService.findBroadcastMessageById(id);
    if (!oldMsg) {
      res.status(404).json({ ok: false, message: "Mensagem não encontrada." });
      return;
    }

    const clearedCount = await broadcastService.resetBroadcastViews(id);
    const ctx = getAdminReqContext(req);
    void logAdminAction({
      ...ctx,
      action: "BROADCAST_RESET_VIEWS",
      module: "broadcast",
      resource: "BroadcastMessage",
      resourceId: String(id),
      newValue: { clearedViewsCount: clearedCount },
    });

    res.json({
      ok: true,
      clearedViewsCount: clearedCount,
      message: `Visualizações resetadas com sucesso (${clearedCount} registros limpos).`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function adminDeleteBroadcast(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "ID inválido." });
      return;
    }
    const oldMsg = await broadcastService.findBroadcastMessageById(id);
    await broadcastService.deleteBroadcastMessage(id);

    const ctx = getAdminReqContext(req);
    void logAdminAction({
      ...ctx,
      action: "BROADCAST_DELETE",
      module: "broadcast",
      resource: "BroadcastMessage",
      resourceId: String(id),
      oldValue: oldMsg ? { title: oldMsg.title, isActive: oldMsg.isActive } : undefined,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}
