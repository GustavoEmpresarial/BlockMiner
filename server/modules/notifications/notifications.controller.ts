/** Ported from legacy/server/modules/notifications/notification.controller.ts */
import type { Request, Response } from "express";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as notificationsService from "./notifications.service.js";

const log = logger.child("notifications.controller");

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const notifications = await notificationsService.listNotificationsForUser(user.id);
    res.json({ ok: true, notifications });
  } catch (error: unknown) {
    log.error("Failed to fetch notifications", { error: String(error) });
    res.status(500).json({ ok: false, message: "Error fetching notifications" });
  }
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    await notificationsService.markNotificationAsRead(user.id, String(req.params.id ?? ""));
    res.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "INVALID_ID") {
      res.status(400).json({ ok: false, message: "Invalid notification id." });
      return;
    }
    log.error("Failed to mark notification as read", { error: msg });
    res.status(500).json({ ok: false, message: "Error updating notification" });
  }
}
